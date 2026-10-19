import { useEffect, useRef, useState } from "react";
import type { useAccount } from "./client";
import { AccountClientError } from "./client";
import type { CatalogItem } from "./library.server";
import type { SaveProfile, SaveRevision, SaveHistory } from "./saves.server";
import { draftsFor, saveDraft, removeDraft, type SaveDraft } from "./outbox";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../components/ui/alert-dialog";
import { SharePublish } from "./share-publish";
export function CloudBackups({
  account,
  catalog,
  run,
}: {
  account: ReturnType<typeof useAccount>;
  catalog: CatalogItem[];
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const owner = account.me!.user.id;
  const fileInput = useRef<HTMLInputElement>(null);
  const [enabled, setEnabled] = useState(false),
    [sharing, setSharing] = useState(false),
    [shareRevision, setShareRevision] = useState<SaveRevision | null>(null),
    [version, setVersion] = useState(""),
    [profile, setProfile] = useState<SaveProfile | null>(null),
    [history, setHistory] = useState<SaveRevision[]>([]),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [drafts, setDrafts] = useState<SaveDraft[]>([]),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState<{
      kind: "restore" | "delete" | "discard";
      id: string;
    } | null>(null);
  const owned = <T,>(path: string, body?: unknown, method?: string) =>
    account.request<T>(path, body, method, owner);
  const reloadDrafts = async () => setDrafts(await draftsFor(owner));
  function historyItems(page: SaveHistory | null): SaveRevision[] {
    if (!page) return [];
    return page.current && !page.items.some((r) => r.id === page.current!.id)
      ? [page.current, ...page.items]
      : page.items;
  }
  async function load(versionId = version) {
    const profiles = await owned<SaveProfile[]>(
      "/api/me/save-profiles?versionId=" + encodeURIComponent(versionId),
    );
    const next = profiles[0] ?? null;
    setProfile(next);
    const page = next
      ? await owned<SaveHistory>(`/api/me/save-profiles/${next.id}/revisions`)
      : null;
    setHistory(historyItems(page));
    setNextCursor(page?.next ?? null);
    await reloadDrafts();
  }
  useEffect(() => {
    let live = true;
    void account
      .request<{ manual: boolean; sharing: boolean }>("/api/cloud-options")
      .then((options) => {
        if (live) {
          setEnabled(options.manual);
          setSharing(options.sharing);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [account.request]);
  useEffect(() => {
    if (!enabled || !version) return;
    let live = true;
    setProfile(null);
    setHistory([]);
    void owned<SaveProfile[]>(
      "/api/me/save-profiles?versionId=" + encodeURIComponent(version),
    )
      .then(async (profiles) => {
        const next = profiles[0] ?? null;
        const revisions = next
          ? await owned<SaveHistory>(
              `/api/me/save-profiles/${next.id}/revisions`,
            )
          : null;
        const pending = await draftsFor(owner);
        if (live) {
          setProfile(next);
          setHistory(historyItems(revisions));
          setNextCursor(revisions?.next ?? null);
          setDrafts(pending);
        }
      })
      .catch(() => {
        if (live) setMessage("备份暂时无法读取，请重试。");
      });
    return () => {
      live = false;
    };
  }, [version, enabled, owner]);
  async function upload(draft: SaveDraft) {
    if (!account.isOwner(owner))
      throw new AccountClientError("IDENTITY_CHANGED");
    try {
      const upload = await owned<{
        id: string;
        complete: boolean;
        files: { id: string; name: string }[];
      }>(`/api/me/save-profiles/${draft.profile}/uploads`, {
        captureId: draft.captureId,
        expectedHead: draft.expectedHead,
        generation: draft.generation,
        files: draft.files.map(({ blob, ...file }) => file),
      });
      if (!upload.complete)
        for (const file of upload.files) {
          const local = draft.files.find((f) => f.name === file.name)!;
          await account.upload(
            `/api/me/uploads/${upload.id}/files/${file.id}`,
            local.blob,
            owner,
          );
        }
      await owned(`/api/me/uploads/${upload.id}/commit`, {});
      await removeDraft(draft.key);
      setMessage("文件备份已保存到云端。游戏内是否可读仍需你导入后确认。");
      await load(draft.version);
    } catch (error) {
      if (
        error instanceof AccountClientError &&
        error.code === "CONTENT_CONFLICT"
      ) {
        await saveDraft({ ...draft, status: "conflict" });
        setMessage(
          "云端已有另一份新备份。两份都已保留，请在历史中选择；不会自动覆盖。",
        );
        await load(draft.version);
        return;
      }
      setMessage(
        "上传未完成，副本仍保留在此账号的本机待上传列表。重新登录原账号后可继续。",
      );
      await reloadDrafts();
      throw error;
    }
  }
  async function capture() {
    if (!files.length) throw new AccountClientError("MANIFEST_INVALID");
    if (
      files.length > 512 ||
      files.some((f) => f.size > 32 * 1024 ** 2) ||
      files.reduce((n, f) => n + f.size, 0) > 64 * 1024 ** 2
    )
      throw new AccountClientError("SNAPSHOT_LIMIT");
    const target =
      profile?.versionId === version
        ? profile
        : await owned<SaveProfile>("/api/me/save-profiles", {
            versionId: version,
          });
    const sealed = [];
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const sha256 = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      sealed.push({
        name: file.name.normalize("NFC"),
        bytes: bytes.byteLength,
        sha256,
        blob: new Blob([bytes]),
      });
    }
    const captureId = crypto.randomUUID();
    const draft: SaveDraft = {
      key: captureId,
      owner,
      profile: target.id,
      version,
      generation: target.generation,
      expectedHead: target.head,
      captureId,
      files: sealed,
      status: "pending",
    };
    try {
      await saveDraft(draft);
    } catch {
      throw new AccountClientError("LOCAL_STORAGE");
    }
    if (!account.isOwner(owner))
      throw new AccountClientError("IDENTITY_CHANGED");
    setProfile(target);
    setFiles([]);
    if (fileInput.current) fileInput.current.value = "";
    await reloadDrafts();
    setMessage("已备份到此设备，正在上传…");
    await upload(draft);
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await run(fn);
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return null;
  const pending = drafts.filter((d) => d.version === version);
  return (
    <Card className="account-cloud">
      <CardHeader>
        <CardTitle>
          <h2>云端文件备份</h2>
        </CardTitle>
        <CardDescription>
          先从游戏内导出存档，再选择文件备份。保留历史；不会自动读取或覆盖浏览器里的游戏存档。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <NativeSelect
          aria-label="存档所属版本"
          disabled={busy}
          value={version}
          onChange={(e) => {
            setVersion(e.target.value);
            setMessage("");
            setFiles([]);
          }}
        >
          <NativeSelectOption value="">
            选择存档所属的游戏版本…
          </NativeSelectOption>
          {catalog.flatMap((w) =>
            w.versions.map((v) => (
              <NativeSelectOption key={v.id} value={v.id}>
                {w.title} · 版本 {v.number}
              </NativeSelectOption>
            )),
          )}
        </NativeSelect>
        {version && (
          <>
            <div className="space-y-3">
              <Label htmlFor="save-files">游戏导出的存档文件</Label>
              <Input
                id="save-files"
                ref={fileInput}
                type="file"
                multiple
                disabled={busy || pending.length > 0}
                onChange={(e) => setFiles([...(e.target.files ?? [])])}
              />
              <p className="text-xs text-muted-foreground">
                每文件最多 32 MiB，一次最多 64 MiB / 512 个文件。云端总额度 512
                MiB。
              </p>
              <Button
                disabled={busy || !files.length || pending.length > 0}
                onClick={() => action(capture)}
              >
                保留云端历史，保存为新备份
              </Button>
            </div>
            {pending.map((draft) => (
              <div className="account-pending space-y-2" key={draft.key}>
                <p>
                  {draft.status === "conflict"
                    ? "需要选择的冲突副本"
                    : "待上传副本"}{" "}
                  · {draft.files.length} 个文件
                </p>
                <div className="flex flex-wrap gap-2">
                  {draft.files.map((file) => (
                    <Button
                      key={file.name}
                      variant="link"
                      onClick={() => {
                        if (!account.isOwner(owner)) return;
                        const url = URL.createObjectURL(file.blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = file.name;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                    >
                      导出本机 {file.name}
                    </Button>
                  ))}
                  {draft.status === "pending" && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => action(() => upload(draft))}
                    >
                      继续上传
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({ kind: "discard", id: draft.key })
                    }
                  >
                    移除此设备的待上传副本
                  </Button>
                </div>
              </div>
            ))}
            {history.length > 0 && (
              <div className="space-y-4">
                <h3>备份历史</h3>
                {history.map((revision) => (
                  <div className="account-pending space-y-2" key={revision.id}>
                    <p>
                      {new Date(revision.createdAt).toLocaleString("zh-CN")} ·{" "}
                      {revision.originKind === "share"
                        ? "收到的存档副本"
                        : revision.conflict
                          ? "保留的冲突分支"
                          : revision.id === profile?.head
                            ? "当前云端备份"
                            : "历史备份"}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {sharing && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShareRevision(revision)}
                        >
                          分享这份存档
                        </Button>
                      )}
                      {revision.files.map((file) => (
                        <a
                          className="underline text-sm break-all max-w-full"
                          key={file.name}
                          href={`/api/me/save-profiles/${profile!.id}/revisions/${revision.id}/files?name=${encodeURIComponent(file.name)}`}
                        >
                          下载 {file.name}
                        </a>
                      ))}
                      {revision.id !== profile?.head && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({ kind: "restore", id: revision.id })
                          }
                        >
                          设为当前云端备份
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {nextCursor && profile && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const page = await owned<SaveHistory>(
                      `/api/me/save-profiles/${profile.id}/revisions?cursor=${encodeURIComponent(nextCursor)}`,
                    );
                    setHistory((current) => [
                      ...new Map(
                        [...current, ...page.items].map((r) => [r.id, r]),
                      ).values(),
                    ]);
                    setNextCursor(page.next);
                  })
                }
              >
                加载更早的备份
              </Button>
            )}
            {profile && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirm({ kind: "delete", id: profile.id })}
              >
                删除这个版本的云端备份
              </Button>
            )}
          </>
        )}
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
        {shareRevision && profile && (
          <SharePublish
            account={account}
            profile={profile}
            revision={shareRevision}
            versionTitle={
              catalog
                .flatMap((w) => w.versions)
                .find((v) => v.id === profile.versionId)?.title ??
              "所选游戏版本"
            }
            close={() => setShareRevision(null)}
          />
        )}
        <AlertDialog
          open={!!confirm}
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.kind === "restore"
                  ? "选择这份云端备份？"
                  : confirm?.kind === "delete"
                    ? "删除这个版本的云端备份？"
                    : "移除此设备的待上传副本？"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm?.kind === "restore"
                  ? "会保留原有历史并创建新的当前备份。浏览器游戏里的存档不会改变；请下载后自行导入。"
                  : confirm?.kind === "delete"
                    ? "现有云端文件将不再可下载，此版本的所有分享链接也会撤回。旧上传不会重新创建它们。游戏本地存档不受影响。"
                    : "尚未上传的文件将从此设备移除。请先确认另有备份；云端已保存的历史不会改变。"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const choice = confirm;
                  setConfirm(null);
                  if (choice)
                    void action(async () => {
                      if (choice.kind === "discard") {
                        await removeDraft(choice.id);
                        await reloadDrafts();
                      } else if (choice.kind === "restore" && profile) {
                        await owned(
                          `/api/me/save-profiles/${profile.id}/restore`,
                          {
                            sourceId: choice.id,
                            expectedHead: profile.head,
                            generation: profile.generation,
                          },
                        );
                        await load();
                      } else if (profile) {
                        await owned(
                          `/api/me/save-profiles/${profile.id}`,
                          {
                            expectedHead: profile.head,
                            generation: profile.generation,
                          },
                          "DELETE",
                        );
                        await load();
                      }
                    });
                }}
              >
                确认
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
