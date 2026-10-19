import { SHARE_PROGRESS } from "../accounts/share-metadata";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useAccount, AccountClientError, errorCopy } from "../accounts/client";
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
export function meta() {
  return [
    { title: "玩家存档 · WG" },
    { name: "robots", content: "noindex,nofollow" },
  ];
}
export default function Share() {
  const { shareId = "" } = useParams(),
    account = useAccount();
  const [secret, setSecret] = useState<string | undefined>(),
    [ready, setReady] = useState(false),
    [view, setView] = useState<ShareView | null>(null),
    [missing, setMissing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [name, setName] = useState(""),
    [invite, setInvite] = useState(""),
    [report, setReport] = useState("");
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
    if (!ready) return;
    let live = true;
    setMissing(false);
    setView(null);
    void account
      .request<ShareView>(
        secret
          ? `/api/share-links/${encodeURIComponent(shareId)}/inspect`
          : `/api/public/save-shares/${encodeURIComponent(shareId)}`,
        secret ? { secret } : undefined,
      )
      .then((data) => {
        if (live) setView(data);
      })
      .catch(() => {
        if (live) setMissing(true);
      });
    return () => {
      live = false;
    };
  }, [shareId, secret, ready, account.me?.binding, account.request]);
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
    link.download = name?.split("/").at(-1) ?? "WG-存档分享.zip";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <header className="site-header">
        <a className="brand" href="https://wg.saop.cc/">
          WG<span>故事放映室</span>
        </a>
        <Button asChild variant="outline">
          <a href="/account">我的账号</a>
        </Button>
      </header>
      <main className="container share-shell">
        {missing ? (
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
                <ul className="text-sm space-y-2">
                  {view.files.map((f) => (
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
                </ul>
                <p className="text-sm text-muted-foreground">
                  SHA256
                  校验只证明文件完整；实际读档取决于对应游戏版本。领取不会改变当前备份或游戏内存档。
                </p>
              </CardContent>
            </Card>
            {!account.me ? (
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
                      还没有预览账号？
                    </summary>
                    <form
                      className="space-y-3 mt-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action(() =>
                          account.passkey("signup", name, invite),
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
                      <Label htmlFor="share-signup-invite">预览邀请码</Label>
                      <Input
                        id="share-signup-invite"
                        type="password"
                        value={invite}
                        onChange={(e) => setInvite(e.target.value)}
                        required
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
                          await account.request(
                            "/api/me/share-claims",
                            { shareId, secret, requestId: claimKey.current.id },
                            undefined,
                            owner,
                          );
                          setMessage(
                            "已保存独立副本，当前备份与游戏内存档未改变。",
                          );
                        })
                      }
                    >
                      保存到我的云存档
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => action(() => download())}
                    >
                      下载完整存档包
                    </Button>
                    <Button variant="link" asChild>
                      <a href="/account">查看收到的存档</a>
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
                            await account.request(
                              "/api/me/share-reports",
                              { shareId, secret, reason: report },
                              undefined,
                              account.me!.user.id,
                            );
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
      </main>
    </>
  );
}
