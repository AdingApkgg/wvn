import { brand } from "../brand";
import { SHARE_PROGRESS } from "../accounts/share-metadata";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { AccountClientError, errorCopy } from "../accounts/client";
import type { ShareView } from "../accounts/share-types";
import { Button } from "../components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useContentAccess } from "../content/client";
import { ContentGate } from "../content/gate";
import { ContentSettings } from "./content";
import {AccountConsumer,type ReaderAccount} from '../accounts/account-consumer';
export function meta() {
  return [
    { title: `玩家存档 · ${brand.shortName}` },
    { name: "robots", content: "noindex,nofollow" },
  ];
}
export default function Share() {
  return <AccountConsumer>{account=><SharePage account={account}/>}</AccountConsumer>;
}
function SharePage({account}:{account:ReaderAccount}) {
  const { shareId = "" } = useParams();
  const content = useContentAccess(), scope = content.enabled ? content.access : null;
  const scopeReady = !content.enabled || (!content.loading && !content.pendingPublic);
  const binding = account.me?.binding ?? "";
  const [secret, setSecret] = useState<string | undefined>(),
    [ready, setReady] = useState(false),
    [storedView, setView] = useState<ShareView | null>(null),
    [missing, setMissing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [name, setName] = useState(""),
    [report, setReport] = useState("");
  const [storedGate, setGate] = useState("");
  const [loaded, setLoaded] = useState<{ scope: typeof scope; binding: string; shareId: string; secret: typeof secret } | null>(null);
  const current = useRef({ scope, binding, shareId, secret, ready: scopeReady });
  current.current = { scope, binding, shareId, secret, ready: scopeReady };
  const visible = !!loaded && scopeReady && loaded.scope === scope && loaded.binding === binding && loaded.shareId === shareId && loaded.secret === secret;
  const view = visible ? storedView : null;
  const gate = visible ? storedGate : "";
  const returnTo = "/s/" + encodeURIComponent(shareId);
  const claimKey = useRef({ owner: "", id: "" });
  useEffect(() => {
    const update = () => {
      const value = new URLSearchParams(location.hash.slice(1)).get("key");
      setSecret(value && value.length <= 100 ? value : undefined);
      setReady(true);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    const clear = () => {
      setMessage("");
      setReport("");
      claimKey.current = { owner: "", id: "" };
    };
    window.addEventListener("wg-account-invalidated", clear);
    return () => window.removeEventListener("wg-account-invalidated", clear);
  }, []);
  useEffect(() => {
    if (!ready || !scopeReady) return;
    let live = true;
    const captured = { scope, binding, shareId, secret };
    const accepts = () => live && current.current.ready && current.current.scope === scope && current.current.binding === binding && current.current.shareId === shareId && current.current.secret === secret;
    setMissing(false);
    setGate("");
    setView(null);
    setMessage(""); setReport(""); claimKey.current = { owner: "", id: "" };
    void (secret
      ? account.api.shareInspect({ params: { id: shareId }, body: { secret } })
      : account.api.publicShareGet({ params: { id: shareId } }))
      .then((data) => {
        if (accepts()) { setView(data); setLoaded(captured); }
      })
      .catch((error) => {
        if (!accepts()) return;
        if (error instanceof AccountClientError && (error.code.startsWith("CONTENT_") || error.code === "SIGN_IN_REQUIRED")) setGate(error.code);
        else setMissing(true);
        setLoaded(captured);
      });
    return () => {
      live = false;
    };
  }, [shareId, secret, ready, binding, account.api, scope, scopeReady]);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(
        errorCopy(e instanceof AccountClientError ? e.code : "NETWORK"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function download(name?: string) {
    const owner = account.me!.user.id,
      blob = await account.download(
        "/api/me/share-downloads",
        { shareId, secret, ...(name ? { name } : {}) },
        owner,
      );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name?.split("/").at(-1) ?? `${brand.shortName}-存档分享.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <main className="container share-shell">
        {gate ? <ContentGate code={gate} returnTo={returnTo} action={<Button onClick={() => document.getElementById("share-content-settings")?.scrollIntoView({ block: "start" })}>在本页查看浏览设置</Button>} /> : visible && missing ? (
          <Card>
            <CardHeader>
              <CardTitle>分享已失效或暂不可用。</CardTitle>
              <CardDescription>
                请确认链接完整，或联系分享者。已成功领取的副本仍可在自己的账号查看。
              </CardDescription>
            </CardHeader>
          </Card>
        ) : !view ? (
          <p role="status">正在读取分享…</p>
        ) : (
          <>
            <section className="share-heading">
              <p className="eyebrow">A CHAPTER TO SHARE</p>
              <h1>{view.title}</h1>
              <p>
                {view.work.title} · 版本 {view.version.number} ·{" "}
                {view.version.title}
              </p>
              {view.version.engineReleaseId&&<p className="text-sm">新版独立档案 · <code title={view.version.engineReleaseId}>{view.version.engineReleaseId.slice(0,20)}</code></p>}
              <p className="text-xs text-muted-foreground">
                {view.contentRedacted ? "受限文字已隐藏，版本归属保持不变。" : view.metadataBasis === "published"
                  ? "版本信息已按发布时保存。"
                  : "旧分享未保存发布时版本信息，当前显示目录信息。"}
              </p>
              {view.publicSource && (
                <p>
                  <a
                    className="underline"
                    href={`/s/${view.publicSource.id}`}
                    aria-label="查看公开来源"
                  >
                    公开来源：{view.publicSource.title}
                  </a>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {view.mode === "public" ? "公开分享" : "链接分享"}
                </Badge>
                <Badge variant="outline">文件完整性已校验</Badge>
                <Badge variant="outline">游戏兼容性由作者标注</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {view.author} ·{" "}
                {new Date(view.createdAt).toLocaleString("zh-CN")} ·{" "}
                {(view.bytes / 1024).toFixed(1)} KiB
                {view.expiresAt &&
                  ` · ${new Date(view.expiresAt).toLocaleDateString("zh-CN")} 到期`}
              </p>
            </section>
            <Card>
              <CardHeader>
                <CardTitle>存档说明</CardTitle>
                <CardDescription>
                  进度类型 · {SHARE_PROGRESS[view.progress]}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {view.spoiler ? (
                  <details>
                    <summary className="cursor-pointer">展开剧透说明</summary>
                    <p className="whitespace-pre-wrap break-words mt-3">
                      {view.description || "作者未填写说明。"}
                    </p>
                  </details>
                ) : (
                  <p className="whitespace-pre-wrap break-words">
                    {view.description || "作者未填写说明。"}
                  </p>
                )}
                <details><summary>文件明细 · {view.contentRedacted?0:view.files.length} 个文件</summary><ul className="text-sm space-y-2 mt-3">
                  {(view.contentRedacted ? [] : view.files).map((f) => (
                    <li className="break-all" key={f.name}>
                      {f.name} · {f.bytes} 字节{" "}
                      {account.me && (
                        <Button
                          variant="link"
                          size="sm"
                          disabled={busy}
                          onClick={() => action(() => download(f.name))}
                        >
                          下载此文件
                        </Button>
                      )}
                    </li>
                  ))}
                </ul></details>
                <p className="text-sm text-muted-foreground">
                  SHA256
                  校验只证明文件完整；实际读档取决于对应游戏版本。领取不会改变当前备份或游戏内存档。
                </p>
              </CardContent>
            </Card>
            {view.contentRedacted ? <Card><CardHeader><CardTitle>查看完整分享</CardTitle><CardDescription>受限的文字和文件已隐藏。可在本页登录、完成规则测试并主动开启显示。</CardDescription></CardHeader></Card> : !account.me ? (
              <Card>
                <CardHeader>
                  <CardTitle>登录后领取或下载</CardTitle>
                  <CardDescription>
                    使用通行密钥留在此页完成登录，完整分享链接不会传给游戏站点。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    disabled={busy || account.loading}
                    onClick={() => action(() => account.passkey("login"))}
                  >
                    使用通行密钥登录
                  </Button>
                  <details>
                    <summary className="cursor-pointer">
                      还没有账号？
                    </summary>
                    <form
                      className="space-y-3 mt-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action(() =>
                          account.passkey("signup", name),
                        );
                      }}
                    >
                      <Label htmlFor="share-signup-name">昵称</Label>
                      <Input
                        id="share-signup-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={40}
                      />
                      <Button type="submit" disabled={busy}>
                        创建通行密钥并注册
                      </Button>
                    </form>
                  </details>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>保存这一份故事进度</CardTitle>
                  <CardDescription>
                    领取生成你的独立副本，原分享撤回后仍可保留。是否设为当前云端备份，由你另行选择。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3 flex-wrap">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          const owner = account.me!.user.id;
                          if (claimKey.current.owner !== owner)
                            claimKey.current = {
                              owner,
                              id: crypto.randomUUID(),
                            };
                          await account.api.shareClaim({ body: { shareId, secret, requestId: claimKey.current.id } }, { context: { owner } });
                          setMessage(
                            "已保存独立副本，当前备份与游戏内存档未改变。",
                          );
                        })
                      }
                    >
                      保存到我的备份
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => action(() => download())}
                    >
                      下载完整存档包
                    </Button>
                    <Button variant="link" asChild>
                      <a href="/account?tab=saves">查看我的备份</a>
                    </Button>
                  </div>
                  <details>
                    <summary className="text-sm cursor-pointer">
                      举报这份分享
                    </summary>
                    <div className="space-y-3 mt-3">
                      <Label htmlFor="share-report">举报原因</Label>
                      <Textarea
                        id="share-report"
                        value={report}
                        maxLength={1000}
                        onChange={(e) => setReport(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        disabled={busy || !report.trim()}
                        onClick={() =>
                          action(async () => {
                            await account.api.shareReport({ body: { shareId, secret, reason: report } }, { context: { owner: account.me!.user.id } });
                            setReport("");
                            setMessage("举报已提交，等待管理员处理。");
                          })
                        }
                      >
                        提交举报
                      </Button>
                    </div>
                  </details>
                </CardContent>
              </Card>
            )}
            {(message || account.error) && (
              <p role="status">{message || account.error}</p>
            )}
          </>
        )}
        {content.enabled && <div id="share-content-settings" hidden={!gate && !view?.contentRedacted} className="mt-8"><ContentSettings embedded returnTo={returnTo} /></div>}
      </main>
    </>
  );
}
