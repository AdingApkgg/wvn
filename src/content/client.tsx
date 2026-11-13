import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRevalidator } from "react-router";
import { AccountClientError, errorCopy, useAccount } from "../accounts/client";
import { PUBLIC_CONTENT_ACCESS } from "./policy";
import type { ContentAccess, DisplayMode } from "./types";

type Account = ReturnType<typeof useAccount>;
type ContentRequest = <T = Record<string, unknown>>(path: string, body?: unknown, method?: string) => Promise<T>;
type ContentContextValue = {
  access: ContentAccess;
  enabled: boolean;
  loading: boolean;
  error: string;
  pendingPublic: boolean;
  account: Account | null;
  refresh: (silent?: boolean) => Promise<ContentAccess>;
  request: ContentRequest;
  setMode: (mode: DisplayMode) => Promise<ContentAccess>;
};

function unavailable(): never { throw new AccountClientError("CONTENT_DISABLED"); }
const ContentContext = createContext<ContentContextValue>({
  access: PUBLIC_CONTENT_ACCESS, enabled: false, loading: false, error: "", pendingPublic: false, account: null,
  refresh: async () => PUBLIC_CONTENT_ACCESS, request: async () => unavailable(), setMode: async () => unavailable(),
});

export function contentErrorCopy(error: unknown) {
  const code = error instanceof AccountClientError ? error.code : "NETWORK";
  return ({
    CONTENT_DISABLED: "浏览设置暂未开放，可以继续公共浏览。",
    CONTENT_RETRY_LATER: "暂时不能再次提交，请查看下方的可重试时间。",
    CONTENT_POLICY_CHANGED: "规则已更新，请重新领取题目；本次未计入提交次数。",
    CONTENT_ATTEMPT_EXPIRED: "这份题目已过期，请重新领取；本次未计入提交次数。",
    CONTENT_ATTEMPT_NOT_FOUND: "这份题目已失效，请重新领取。",
    CONTENT_ANSWERS_INVALID: "请完成全部题目，再提交答案。",
    CONTENT_SUSPENDED: "当前浏览资格已暂停，暂时无法重新测试或开启。",
    CONTENT_UNQUALIFIED: "请先完成规则测试，再主动开启显示。",
    CONTENT_QUALIFICATION_REQUIRED: "请先完成规则测试，再主动开启显示。",
    CONTENT_RETEST_REQUIRED: "本站规则已更新，请重新完成规则测试。",
    CONTENT_MODE_REQUIRED: "当前会话处于公共浏览，请先主动开启 NSFW 显示。",
  } as Record<string, string>)[code] ?? errorCopy(code);
}

function checkedAccess(value: unknown): ContentAccess {
  if (!value || typeof value !== "object") throw new AccountClientError("NETWORK");
  const access = value as ContentAccess;
  if (typeof access.authenticated !== "boolean" ||
    !["unqualified", "qualified", "suspended", "needs_retest"].includes(access.eligibility) ||
    !["public", "restricted"].includes(access.displayMode) || typeof access.canViewRestricted !== "boolean" ||
    typeof access.requiredPolicyVersion !== "string" || !Number.isSafeInteger(access.attemptsRemaining) ||
    access.attemptsRemaining < 0 || !(access.nextAttemptAt === null || Number.isFinite(access.nextAttemptAt)))
    throw new AccountClientError("NETWORK");
  const canViewRestricted = access.authenticated && access.eligibility === "qualified" &&
    access.displayMode === "restricted" && access.canViewRestricted;
  return { ...access, canViewRestricted, displayMode: canViewRestricted ? "restricted" : "public" };
}

export function ContentProvider({ initial, enabled, children }: { initial: ContentAccess; enabled: boolean; children: ReactNode }) {
  return enabled ? <EnabledContentProvider initial={initial}>{children}</EnabledContentProvider> :
    <ContentContext.Provider value={{
      access: PUBLIC_CONTENT_ACCESS, enabled: false, loading: false, error: "", pendingPublic: false, account: null,
      refresh: async () => PUBLIC_CONTENT_ACCESS, request: async () => unavailable(), setMode: async () => unavailable(),
    }}>{children}</ContentContext.Provider>;
}

function EnabledContentProvider({ initial, children }: { initial: ContentAccess; children: ReactNode }) {
  const account = useAccount();
  const revalidator = useRevalidator();
  const [access, setAccess] = useState(() => checkedAccess(initial));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingPublic, setPendingPublic] = useState(false);
  const current = useRef(access), alive = useRef(false), epoch = useRef(0), sequence = useRef(0);
  const forcePublic = useRef(false), channel = useRef<BroadcastChannel | null>(null), syncingAccount = useRef(false);
  const publicRequested = useRef(false);
  const seenMessages = useRef(new Set<string>());
  const accountRef = useRef(account), revalidatorRef = useRef(revalidator);
  const initialRef = useRef(initial);
  accountRef.current = account;
  revalidatorRef.current = revalidator;

  const publish = useCallback((next: ContentAccess, revalidate = false, renewSnapshot = false) => {
    if (!alive.current) return current.current;
    const unchanged = (Object.keys(PUBLIC_CONTENT_ACCESS) as (keyof ContentAccess)[])
      .every(key => current.current[key] === next[key]);
    if (unchanged && !revalidate && !renewSnapshot) return current.current;
    const visibilityChanged = current.current.canViewRestricted !== next.canViewRestricted;
    current.current = next;
    setAccess(next);
    // 同步事件先于网络操作发出，运行中的播放器据此遮挡和静音，保留实例与本机存档。
    window.dispatchEvent(new CustomEvent("wg-content-change", { detail: { access: next } }));
    if (revalidate || visibilityChanged) void revalidatorRef.current.revalidate();
    return next;
  }, []);

  const lock = useCallback((identity = false) => {
    epoch.current++;
    sequence.current++;
    publish(identity ? { ...PUBLIC_CONTENT_ACCESS } : { ...current.current, displayMode: "public", canViewRestricted: false });
  }, [publish]);

  const accept = useCallback((value: unknown, revalidate = false) => {
    const next = checkedAccess(value);
    if (forcePublic.current) {
      next.displayMode = "public";
      next.canViewRestricted = false;
    }
    return publish(next, revalidate);
  }, [publish]);

  const refresh = useCallback(async (silent = false) => {
    const start = epoch.current, seq = ++sequence.current;
    if (!silent) {
      // 显式复查换一份展示快照；即使结果权限相同，也不能短暂重用复查前的独立 API 文案。
      publish({ ...current.current }, false, true);
      setLoading(true);
    }
    try {
      const response = await fetch("/api/me/content", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(5_000) });
      const next = response.status === 401 ? { ...PUBLIC_CONTENT_ACCESS } :
        response.ok ? checkedAccess(await response.json()) : (() => { throw new AccountClientError("NETWORK"); })();
      if (!alive.current || start !== epoch.current || seq !== sequence.current) return current.current;
      setError("");
      return accept(next);
    } catch {
      if (alive.current && start === epoch.current && seq === sequence.current) {
        publish({ ...PUBLIC_CONTENT_ACCESS });
        setError("暂时无法确认浏览资格，当前使用公共浏览。请稍后重试。");
      }
      return current.current;
    } finally {
      if (!silent && alive.current && start === epoch.current && seq === sequence.current) setLoading(false);
    }
  }, [accept, publish]);

  const announce = useCallback((kind: "public" | "refresh") => {
    const message = { kind, id: crypto.randomUUID() };
    seenMessages.current.add(message.id);
    channel.current?.postMessage(message);
    try { localStorage.setItem("wg-content-change", JSON.stringify(message)); } catch {}
  }, []);

  useEffect(() => {
    alive.current = true;
    const check = () => { lock(); void refresh(); };
    const identityChanged = () => {
      forcePublic.current = true;
      setPendingPublic(publicRequested.current);
      lock(true);
      // 账号页可能拥有另一个 hook；只进行一次同步，避免失败事件导致递归重试。
      if (!syncingAccount.current) {
        syncingAccount.current = true;
        void accountRef.current.refresh().finally(() => {
          syncingAccount.current = false;
          if (!alive.current) return;
          forcePublic.current = publicRequested.current;
          void refresh();
        });
      }
    };
    const changed = (message: unknown) => {
      if (message && typeof message === "object" && "id" in message && typeof message.id === "string") {
        if (seenMessages.current.has(message.id)) return;
        seenMessages.current.add(message.id);
        if (seenMessages.current.size > 100) seenMessages.current.delete(seenMessages.current.values().next().value!);
      }
      publicRequested.current = !!message && typeof message === "object" && (message as { kind?: string }).kind === "public";
      forcePublic.current = publicRequested.current;
      setPendingPublic(forcePublic.current);
      lock();
      void refresh();
    };
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("wg-content");
      channel.current.onmessage = event => changed(event.data);
    }
    const storage = (event: StorageEvent) => {
      if (event.key === "wg-account-change") { identityChanged(); return; }
      if (event.key !== "wg-content-change") return;
      try { changed(JSON.parse(event.newValue ?? "null")); } catch { changed(null); }
    };
    const visible = () => { if (document.visibilityState === "visible") check(); else lock(); };
    const hiding = () => lock();
    // 首次加载已有本次SSR权限快照；只有缓存恢复会重新展示旧页面，需要先锁定复查。
    const shown = (event: PageTransitionEvent) => { if (event.persisted) check(); };
    window.addEventListener("wg-account-invalidated", identityChanged);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", shown);
    window.addEventListener("pagehide", hiding);
    document.addEventListener("visibilitychange", visible);
    void refresh();
    return () => {
      alive.current = false;
      epoch.current++;
      sequence.current++;
      channel.current?.close();
      window.removeEventListener("wg-account-invalidated", identityChanged);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", shown);
      window.removeEventListener("pagehide", hiding);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [lock, refresh]);

  useEffect(() => {
    if (account.loading) return;
    // 首次账号读取已确认退出或换会话时，不等待另一条资格请求返回才收起SSR旧内容。
    if (current.current.authenticated && (!account.me ||
      account.me.sessionIdentity !== initialRef.current.sessionIdentity)) lock(true);
    void refresh();
  }, [account.loading, account.me?.binding, account.me?.sessionIdentity, lock, refresh]);

  useEffect(() => {
    if (!access.canViewRestricted || loading) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && current.current.canViewRestricted)
        void refresh(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [access.canViewRestricted, loading, refresh]);

  useEffect(() => {
    if (initialRef.current === initial) return;
    initialRef.current = initial;
    // 新路由的服务端快照可以立刻收起权限；开启仍以本轮客户端复查为准，避免旧快照复活显示。
    if (!initial.canViewRestricted && current.current.canViewRestricted) lock(!initial.authenticated);
    void refresh();
  }, [initial, lock, refresh]);

  const request: ContentRequest = useCallback(async <T,>(path: string, body?: unknown, method?: string) => {
    const owner = accountRef.current.me?.user.id;
    if (!owner) throw new AccountClientError("SIGN_IN_REQUIRED");
    const start = epoch.current;
    const result = await accountRef.current.request<T>(path, body, method, owner);
    if (!alive.current || start !== epoch.current) throw new AccountClientError("IDENTITY_CHANGED");
    if (result && typeof result === "object" && "access" in result) {
      sequence.current++;
      accept(result.access);
    }
    return result;
  }, [accept]);

  const setMode = useCallback(async (mode: DisplayMode) => {
    const owner = accountRef.current.me?.user.id;
    if (!owner) throw new AccountClientError("SIGN_IN_REQUIRED");
    if (mode === "public") {
      publicRequested.current = true;
      forcePublic.current = true;
      setPendingPublic(true);
      lock();
      announce("public");
    } else lock();
    const start = epoch.current;
    try {
      const result = await accountRef.current.request<ContentAccess>("/api/me/content/mode", { mode }, "PATCH", owner);
      if (!alive.current || start !== epoch.current) throw new AccountClientError("IDENTITY_CHANGED");
      forcePublic.current = false;
      publicRequested.current = false;
      sequence.current++;
      setPendingPublic(false);
      setError("");
      const next = accept(result, true);
      announce("refresh");
      return next;
    } catch (failure) {
      if (alive.current && start === epoch.current) setError(mode === "public"
        ? "本页已收起敏感内容，公共浏览尚未同步到服务器。请重试同步。" : contentErrorCopy(failure));
      throw failure;
    }
  }, [accept, announce, lock]);

  const value = useMemo<ContentContextValue>(() => ({
    access, enabled: true, loading, error, pendingPublic, account, refresh, request, setMode,
  }), [access, loading, error, pendingPublic, account, refresh, request, setMode]);
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContentAccess() { return useContext(ContentContext); }
