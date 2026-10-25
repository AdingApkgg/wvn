import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
} from "node:fs";
import { resolve, join } from "node:path";
function safeFailure(stage, error) {
  const code =
    typeof error?.code === "string" && /^[A-Z_0-9]{1,64}$/.test(error.code)
      ? error.code
      : "ACCEPTANCE_FAILED";
  return {
    stage,
    code,
    kind:
      typeof error?.name === "string" && /^[A-Za-z]{1,64}$/.test(error.name)
        ? error.name
        : "Error",
  };
}
export class PreviewCleanup {
  constructor({ directory, origin, runId = randomUUID() }) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      url.protocol !== "https:" ||
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error("Exact loopback HTTPS preview origin required");
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(runId))
      throw new Error("Invalid preview run ID");
    this.origin = origin;
    this.runId = runId;
    this.accounts = [];
    this.events = [];
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.report = join(this.directory, runId + ".json");
    this.status = "running";
    this.flush();
  }
  flush() {
    const temporary = this.report + "." + randomUUID() + ".tmp";
    const fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(
        fd,
        JSON.stringify(
          {
            runId: this.runId,
            origin: this.origin,
            status: this.status,
            updatedAt: new Date().toISOString(),
            failure: this.failure ?? null,
            accounts: this.accounts.map(({ context, ...entry }) => entry),
            events: this.events,
          },
          null,
          2,
        ) + "\n",
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, this.report);
    // Windows cannot fsync a directory handle. The report file itself is
    // already flushed before the atomic rename on every platform.
    if (process.platform === "win32") return;
    const directory = openSync(this.directory, "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
  begin(context, label, retainOnSuccess = false) {
    if (!/^[a-z0-9-]{1,64}$/.test(label))
      throw new Error("Generated preview account label required");
    const entry = {
      context,
      label,
      accountId: null,
      retainOnSuccess,
      state: "registration-pending",
      attempts: 0,
    };
    this.accounts.push(entry);
    this.flush();
    return entry;
  }
  identify(entry, id) {
    if (
      !this.accounts.includes(entry) ||
      typeof id !== "string" ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(id) ||
      (entry.accountId && entry.accountId !== id)
    )
      throw new Error("Invalid registered preview owner");
    entry.accountId = id;
    entry.state = "registered";
    this.flush();
  }
  recordFailure(stage, error) {
    if (!this.failure) this.failure = safeFailure(stage, error);
    this.status = "failed";
    this.flush();
  }
  async remove(entry) {
    if (!this.accounts.includes(entry))
      throw new Error("Untracked cleanup target");
    if (entry.state === "deleted")
      return { ok: true, phase: "delete", status: 200 };
    entry.attempts++;
    entry.state = "cleaning";
    this.flush();
    const fail = (code, phase, status) => {
      entry.state = "cleanup-failed";
      const result = {
        ok: false,
        code,
        phase,
        ...(status === undefined ? {} : { status }),
      };
      this.events.push({
        label: entry.label,
        accountId: entry.accountId,
        ...result,
        at: new Date().toISOString(),
      });
      this.flush();
      return result;
    };
    if (!entry.accountId) return fail("OWNER_UNCONFIRMED", "probe");
    let phase = "probe";
    try {
      const options = { timeout: 5000, maxRedirects: 0 };
      const response = await entry.context.request.get(
        this.origin + "/api/me",
        options,
      );
      const status = response.status();
      if (status !== 200) return fail("CLEANUP_PROBE_REJECTED", phase, status);
      let me;
      try {
        me = await response.json();
      } catch {
        return fail("CLEANUP_INVALID_RESPONSE", phase, status);
      }
      if (me?.user?.id !== entry.accountId)
        return fail("OWNER_MISMATCH", phase, status);
      if (typeof me.binding !== "string" || !me.binding)
        return fail("BINDING_MISSING", phase, status);
      phase = "delete";
      const deletion = await entry.context.request.delete(
        this.origin + "/api/me",
        {
          ...options,
          headers: {
            origin: this.origin,
            "content-type": "application/json",
            "x-wg-binding": me.binding,
          },
          data: { confirmation: "DELETE" },
        },
      );
      const deletedStatus = deletion.status();
      if (deletedStatus !== 200)
        return fail("CLEANUP_DELETE_REJECTED", phase, deletedStatus);
      let body;
      try {
        body = await deletion.json();
      } catch {
        return fail("CLEANUP_INVALID_RESPONSE", phase, deletedStatus);
      }
      if (body?.ok !== true)
        return fail("CLEANUP_UNCONFIRMED", phase, deletedStatus);
      entry.state = "deleted";
      this.events.push({
        label: entry.label,
        accountId: entry.accountId,
        ok: true,
        phase,
        status: deletedStatus,
        at: new Date().toISOString(),
      });
      this.flush();
      return { ok: true, phase, status: deletedStatus };
    } catch {
      return fail("CLEANUP_TRANSPORT", phase);
    }
  }
  async finish({ passed, stage, error }) {
    if (!passed) this.recordFailure(stage, error);
    for (const entry of this.accounts) {
      if (entry.state === "deleted") continue;
      if (passed && entry.retainOnSuccess && entry.accountId) {
        entry.state = "retained-example";
        continue;
      }
      await this.remove(entry);
    }
    if (
      passed &&
      this.accounts.some((a) => !a.retainOnSuccess && a.state !== "deleted")
    ) {
      for (const entry of this.accounts.filter(
        (a) => a.retainOnSuccess && a.state !== "deleted",
      ))
        await this.remove(entry);
    }
    const keepExamples =
      passed &&
      !this.accounts.some((a) => !a.retainOnSuccess && a.state !== "deleted");
    const required = this.accounts.filter(
      (a) => !(keepExamples && a.retainOnSuccess && a.accountId),
    );
    const remaining = required.filter((a) => a.state !== "deleted").length;
    this.status = passed && !remaining && !this.failure ? "passed" : "failed";
    this.flush();
    return {
      status: this.status,
      runId: this.runId,
      deleted: this.accounts.filter((a) => a.state === "deleted").length,
      remaining,
      report: this.report,
    };
  }
}
