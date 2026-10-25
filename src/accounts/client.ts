import { readAccountView } from "./response";
import { useCallback, useEffect, useRef, useState } from "react";
import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";
export type AccountView = {
  user: { id: string; name: string };
  binding: string;
  passkeys: { id: string; name: string; createdAt: number; backedUp: number }[];
  devices: { id: string; userAgent: string; current: boolean }[];
  recoveryReady: boolean;
};
export class AccountClientError extends Error {
  constructor(
    public code: string,
    public data?: unknown,
  ) {
    super(code);
  }
}
export function errorCopy(code: string) {
  return (
    (
      {
        NICKNAME_INVALID: "昵称需要 1–40 个可见字符。",
        REAUTH_REQUIRED: "请再使用通行密钥验证一次，然后重试。",
        IDENTITY_CHANGED: "账号状态已变化，请重新操作。",
        LAST_PASSKEY: "请先添加备用密钥，再删除最后一把。",
        RECOVERY_INVALID: "恢复信息无效或已经使用，请检查后重试。",
        RECOVERY_EXPIRED: "恢复已过期，请使用另一枚恢复码重新开始。",
        TRY_LATER: "尝试过于频繁，请稍后再试。",
        NETWORK: "连接暂时中断，请重试。",
        LEGACY_CONTEXT: "请关闭旧版游戏页面并刷新后重试；原存档未修改。",
        LOCAL_STORAGE:
          "此设备无法持久保存待上传副本，请先导出文件或清理浏览器存储后再试。",
        STORAGE_UNAVAILABLE: "云存档存储暂时无法连接，请稍后重试；原备份保留。",
        UPLOAD_BUSY: "当前上传较多，请稍后重试。",
        SPACE_STOP: "服务器已到预留空间红线，暂停新上传；已有备份仍可下载。",
        ACCOUNT_QUOTA: "云端额度不足，请导出并移除不再需要的备份。",
        SNAPSHOT_LIMIT: "存档超过文件数量或大小上限。",
        MANIFEST_INVALID: "文件名、数量或格式不符合备份要求。",
        CONTENT_CONFLICT: "云端已出现更新，请重新查看后再选择。",
        SHARE_UNAVAILABLE: "分享已失效或暂不可用。",
        SHARE_SELF: "这是你发布的快照，可从自己的备份历史下载。",
        SHARE_LIMIT: "有效和待审分享已达到 20 份，请先撤回不再需要的分享。",
        CATALOG_UNAVAILABLE: "游戏目录暂不可用，请稍后重试。",
        VERSION_UNAVAILABLE: "对应游戏版本已下线，暂不能领取或发布。",
        SIGN_IN_REQUIRED: "请先登录账号。",
      } as Record<string, string>
    )[code] ?? "操作未完成。可重新尝试，或检查是否取消了系统验证。"
  );
}
export function useAccount() {
  const [options, setOptions] = useState<{
    passkey: boolean;
    signup: string;
    mode?: string;
    isolated?: boolean;
  } | null>(null);
  const [me, setMe] = useState<AccountView | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const current = useRef<AccountView | null>(null),
    epoch = useRef(0),
    sequence = useRef(0),
    controller = useRef(new AbortController()),
    alive = useRef(false),
    ceremony = useRef(false),
    channel = useRef<BroadcastChannel | null>(null);
  const guard = () => {
    const start = epoch.current;
    return () => {
      if (!alive.current || start !== epoch.current)
        throw new AccountClientError("IDENTITY_CHANGED");
    };
  };
  const withCeremony = async <T>(fn: () => Promise<T>) => {
    ceremony.current = true;
    try {
      return await fn();
    } finally {
      ceremony.current = false;
    }
  };
  const invalidate = useCallback(() => {
    epoch.current++;
    controller.current.abort();
    controller.current = new AbortController();
    current.current = null;
    setMe(null);
    window.dispatchEvent(new Event("wg-account-invalidated"));
  }, []);
  const refresh = useCallback(
    async (clear = false) => {
      if (clear) invalidate();
      const start = epoch.current,
        seq = ++sequence.current;
      try {
        const [response, capabilities] = await Promise.all([
          fetch("/api/me", {
            cache: "no-store",
            signal: controller.current.signal,
          }),
          fetch("/api/login-options", {
            cache: "no-store",
            signal: controller.current.signal,
          }),
        ]);
        if (!capabilities.ok) throw new AccountClientError("NETWORK");
        const available = await capabilities.json();
        if (!response.ok && response.status !== 401)
          throw new AccountClientError("NETWORK");
        const next = await readAccountView(response);
        if (
          !alive.current ||
          seq !== sequence.current ||
          start !== epoch.current
        )
          return;
        if (current.current?.binding !== next?.binding) {
          epoch.current++;
          controller.current.abort();
          controller.current = new AbortController();
          window.dispatchEvent(new Event("wg-account-invalidated"));
        }
        current.current = next;
        setMe(next);
        setOptions(available);
        return { view: next, check: guard() };
      } catch (e) {
        if (
          alive.current &&
          start === epoch.current &&
          !(e instanceof DOMException && e.name === "AbortError")
        ) {
          invalidate();
          setError(errorCopy("NETWORK"));
        }
      } finally {
        if (alive.current && seq === sequence.current) setLoading(false);
      }
    },
    [invalidate],
  );
  useEffect(() => {
    alive.current = true;
    if (controller.current.signal.aborted)
      controller.current = new AbortController();
    void refresh();
    const changed = () => {
      void refresh(true);
    };
    const focus = () => {
      if (!ceremony.current) void refresh();
    };
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("wg-account");
      channel.current.onmessage = changed;
    }
    const storage = (event: StorageEvent) => {
      if (event.key === "wg-account-change") changed();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    return () => {
      alive.current = false;
      sequence.current++;
      controller.current.abort();
      channel.current?.close();
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  const announce = useCallback(() => {
    channel.current?.postMessage("changed");
    try {
      localStorage.setItem("wg-account-change", crypto.randomUUID());
    } catch {}
  }, []);
  const request = useCallback(
    async <T = Record<string, unknown>>(
      path: string,
      body?: unknown,
      method?: string,
      owner?: string,
    ): Promise<T> => {
      if (owner && current.current?.user.id !== owner)
        throw new AccountClientError("IDENTITY_CHANGED");
      const start = epoch.current;
      const response = await fetch(path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          ...(current.current
            ? { "x-wg-binding": current.current.binding }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.current.signal,
      });
      const data = await response.json();
      if (start !== epoch.current)
        throw new AccountClientError("IDENTITY_CHANGED");
      if (!response.ok) {
        if (response.status === 401 || data.code === "IDENTITY_CHANGED")
          await refresh(true);
        throw new AccountClientError(data.code ?? "NETWORK", data);
      }
      return data as T;
    },
    [refresh],
  );
  const upload = async (path: string, blob: Blob, owner: string) => {
    if (current.current?.user.id !== owner)
      throw new AccountClientError("IDENTITY_CHANGED");
    const start = epoch.current;
    const response = await fetch(path, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        "x-wg-binding": current.current.binding,
      },
      body: blob,
      signal: controller.current.signal,
    });
    const data = await response.json();
    if (start !== epoch.current)
      throw new AccountClientError("IDENTITY_CHANGED");
    if (!response.ok) {
      if (response.status === 401 || data.code === "IDENTITY_CHANGED")
        await refresh(true);
      throw new AccountClientError(data.code ?? "NETWORK", data);
    }
  };
  const download = async (
    path: string,
    body: unknown,
    owner: string,
  ): Promise<Blob> => {
    if (current.current?.user.id !== owner)
      throw new AccountClientError("IDENTITY_CHANGED");
    const check = guard();
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wg-binding": current.current.binding,
      },
      body: JSON.stringify(body),
      signal: controller.current.signal,
    });
    if (!response.ok) {
      const data = await response.json();
      throw new AccountClientError(data.code ?? "NETWORK");
    }
    const blob = await response.blob();
    check();
    if (current.current?.user.id !== owner)
      throw new AccountClientError("IDENTITY_CHANGED");
    return blob;
  };
  const authClient = () =>
    createAuthClient({
      plugins: [passkeyClient()],
      fetchOptions: {
        catchAllError: true,
        signal: controller.current.signal,
        headers: current.current
          ? { "x-wg-binding": current.current.binding }
          : {},
      },
    });
  const readFile = async (path: string, owner: string, expectedBytes: number): Promise<Blob> => {
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > 32 * 1024 ** 2) throw new AccountClientError('SNAPSHOT_LIMIT');
    if (current.current?.user.id !== owner) throw new AccountClientError('IDENTITY_CHANGED');
    const check = guard();
    const response = await fetch(path, { cache: 'no-store', signal: controller.current.signal });
    check();
    if (!response.ok) {
      await response.body?.cancel();
      if(response.status===401)await refresh(true);
      throw new AccountClientError(response.status === 401 ? 'SIGN_IN_REQUIRED' : 'NETWORK');
    }
    if (!response.body) throw new AccountClientError('NETWORK');
    const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); check();
        if (done) break;
        total += value.length;
        if (total > expectedBytes) throw new AccountClientError('SNAPSHOT_LIMIT');
        chunks.push(new Uint8Array(value));
      }
      if (total !== expectedBytes) throw new AccountClientError('NETWORK');
      check(); return new Blob(chunks);
    } finally { await reader.cancel().catch(() => {}); }
  };
  const passkey = async (
    kind: "signup" | "login" | "add",
    nickname = "",
  ) => {
    ceremony.current = true;
    const start = epoch.current,
      client = authClient();
    try {
      if(options?.mode==='production'&&options.isolated){
        const path='/player/legacy-context.mjs';
        try{
          const module=await import(/* @vite-ignore */ path) as typeof import('../../public/player/legacy-context.mjs');
          await module.prepareCurrentContext();
          if(localStorage.getItem('wg-isolation-upgrade-20261020')!=='acknowledged'){
            if(!window.confirm('登录前请先关闭其他仍在运行的旧版游戏页面。旧存档不会清除，可在统一播放器内迁移。关闭旧版页面后，点击确定继续。'))throw Error('Legacy tabs acknowledgement cancelled');
            localStorage.setItem('wg-isolation-upgrade-20261020','acknowledged');window.dispatchEvent(new Event('wg-legacy-tabs-acknowledged'));
          }
        }catch{throw new AccountClientError('LEGACY_CONTEXT')}
        if(start!==epoch.current)throw new AccountClientError('IDENTITY_CHANGED');
      }
      const result =
        kind === "login"
          ? await client.signIn.passkey()
          : await client.passkey.addPasskey({
              context: JSON.stringify({ nickname }),
              createSession: true,
            });
      if (start !== epoch.current)
        throw new AccountClientError("IDENTITY_CHANGED");
      if (result.error)
        throw new AccountClientError(
          "code" in result.error && typeof result.error.code === "string"
            ? result.error.code
            : "PASSKEY_INVALID",
        );
      announce();
      await refresh(true);
    } finally {
      ceremony.current = false;
    }
  };
  return {
    me,
    options,
    loading,
    error,
    setError,
    refresh,
    announce,
    request,
    passkey,
    upload,
    download,
    readFile,
    guard,
    withCeremony,
    isOwner: (id: string) => current.current?.user.id === id,
  };
}
