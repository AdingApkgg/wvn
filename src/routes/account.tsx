import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, ShieldCheck, Monitor } from "lucide-react";
import { Library } from "../accounts/library";
import { useAccount, AccountClientError, errorCopy } from "../accounts/client";
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
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
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
export function meta() {
  return [
    { title: "我的故事 · WG" },
    { name: "robots", content: "noindex,nofollow" },
  ];
}
type RecoveryKit = { accountId: string; codes: string[] };
export default function Account() {
  const account = useAccount();
  const {
    me,
    options,
    loading,
    error,
    setError,
    request,
    passkey,
    refresh,
    announce,
  } = account;
  const [busy, setBusy] = useState(false),
    [supported, setSupported] = useState(false),
    [nickname, setNickname] = useState(""),
    [invite, setInvite] = useState("");
  const [recoveryId, setRecoveryId] = useState(""),
    [recoveryCode, setRecoveryCode] = useState(""),
    [kit, setKit] = useState<RecoveryKit | null>(null),
    [remove, setRemove] = useState<string | null>(null),
    [deleteAccount, setDeleteAccount] = useState(false);
  useEffect(() => {
    setSupported(typeof PublicKeyCredential !== "undefined");
    const clear = () => {
      setKit(null);
      setRecoveryCode("");
      setInvite("");
    };
    window.addEventListener("wg-account-invalidated", clear);
    return () => window.removeEventListener("wg-account-invalidated", clear);
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(
          errorCopy(e instanceof AccountClientError ? e.code : "NETWORK"),
        );
    } finally {
      setBusy(false);
    }
  }
  async function recover() {
    await request("/api/recovery/start", {
      accountId: recoveryId.trim(),
      code: recoveryCode.trim(),
    });
    setRecoveryCode("");
    const options = await request<
      Parameters<typeof startRegistration>[0]["optionsJSON"]
    >("/api/recovery/options", {});
    const response = await startRegistration({ optionsJSON: options });
    const result = await request<RecoveryKit>("/api/recovery/complete", {
      response,
    });
    try {
      await passkey("login");
    } finally {
      setKit(result);
    }
  }
  function downloadKit() {
    if (!kit) return;
    const blob = new Blob(
      [
        `WG 恢复码\n账号标识：${kit.accountId}\n每枚码只能使用一次，请保存在可信的离线位置。\n\n${kit.codes.join("\n")}\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "WG-恢复码.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <header className="site-header">
        <a className="brand" href="https://wg.saop.cc/">
          WG<span>故事放映室</span>
        </a>
        <Badge variant="outline">账号远程预览</Badge>
      </header>
      <main
        className={
          "container account-shell" + (!me ? " account-anonymous" : "")
        }
      >
        {!me ? (
          <>
            <section className="account-intro">
              <p className="eyebrow">YOUR STORIES, YOUR KEY</p>
              <h1>让进度，随你同行。</h1>
              <p>
                用通行密钥开启你的私人书架。
                <br />
                一把密钥，留住每次重逢。
              </p>
              <div className="account-promises">
                <span>
                  <Fingerprint size={18} />
                  指纹、面容或设备 PIN
                </span>
                <span>
                  <ShieldCheck size={18} />
                  不必设置账号密码
                </span>
              </div>
            </section>
            <Card className="account-login">
              <CardHeader>
                <CardTitle>
                  <h2>进入故事放映室</h2>
                </CardTitle>
                <CardDescription>
                  通行密钥由你的设备或密码管理器保管。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loading ? (
                  <p role="status">正在确认账号状态…</p>
                ) : (
                  <>
                    <Button
                      className="w-full"
                      disabled={busy || !supported || !options?.passkey}
                      onClick={() => run(() => passkey("login"))}
                    >
                      <Fingerprint />
                      使用通行密钥登录
                    </Button>
                    <Tabs defaultValue="signup">
                      <TabsList>
                        <TabsTrigger value="signup">创建账号</TabsTrigger>
                        <TabsTrigger value="recover">恢复账号</TabsTrigger>
                      </TabsList>
                      <TabsContent value="signup">
                        <form
                          className="space-y-4 pt-4"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run(() => passkey("signup", nickname, invite));
                          }}
                        >
                          <div className="space-y-2">
                            <Label htmlFor="account-nickname">昵称</Label>
                            <Input
                              id="account-nickname"
                              autoComplete="nickname"
                              maxLength={40}
                              required
                              value={nickname}
                              onChange={(e) => setNickname(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="account-invite">预览邀请码</Label>
                            <Input
                              id="account-invite"
                              type="password"
                              autoComplete="off"
                              required
                              value={invite}
                              onChange={(e) => setInvite(e.target.value)}
                            />
                          </div>
                          <Button
                            variant="outline"
                            type="submit"
                            className="w-full"
                            disabled={busy || !supported || !options?.passkey}
                          >
                            创建通行密钥并注册
                          </Button>
                          <p className="text-sm text-muted-foreground">
                            预览账号与正式账号分开。请勿把测试凭据当作正式备份。
                          </p>
                        </form>
                      </TabsContent>
                      <TabsContent value="recover">
                        <form
                          className="space-y-4 pt-4"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run(recover);
                          }}
                        >
                          <div className="space-y-2">
                            <Label htmlFor="recovery-id">恢复账号标识</Label>
                            <Input
                              id="recovery-id"
                              autoComplete="off"
                              required
                              value={recoveryId}
                              onChange={(e) => setRecoveryId(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="recovery-code">一次性恢复码</Label>
                            <Input
                              id="recovery-code"
                              type="password"
                              autoComplete="off"
                              required
                              value={recoveryCode}
                              onChange={(e) => setRecoveryCode(e.target.value)}
                            />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            恢复会替换旧密钥并退出所有旧设备。取消后，这枚恢复码也不会再次可用。
                          </p>
                          <Button
                            variant="outline"
                            type="submit"
                            disabled={busy || !supported || !options?.passkey}
                          >
                            验证恢复码并创建新密钥
                          </Button>
                        </form>
                      </TabsContent>
                    </Tabs>
                  </>
                )}
                {!loading && !supported && (
                  <Alert>
                    <AlertDescription>
                      此浏览器暂不支持通行密钥。你仍可在目录中作为游客游玩。
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <section className="account-heading">
              <div>
                <p className="eyebrow">THE STORIES YOU KEEP</p>
                <h1>我的故事</h1>
                <p>{me.user.name}，欢迎回来。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => run(() => passkey("login"))}
                >
                  重新验证
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await request("/api/auth/sign-out", {});
                      announce();
                      await refresh(true);
                    })
                  }
                >
                  退出账号
                </Button>
              </div>
            </section>
            <Library key={me.user.id} account={account} run={run} />
            <div className="account-grid account-settings">
              <Card>
                <CardHeader>
                  <KeyRound />
                  <CardTitle>
                    <h2>通行密钥</h2>
                  </CardTitle>
                  <CardDescription>
                    建议添加第二把独立的备用密钥。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {me.passkeys.map((key) => (
                    <div key={key.id} className="account-list-row">
                      <div>
                        <form
                          className="flex flex-wrap gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const name = String(
                              new FormData(e.currentTarget).get("name") ?? "",
                            );
                            void run(async () => {
                              await request(
                                `/api/me/passkeys/${key.id}`,
                                { name },
                                "PATCH",
                              );
                              await refresh();
                            });
                          }}
                        >
                          <Input
                            aria-label="密钥名称"
                            name="name"
                            defaultValue={key.name || "通行密钥"}
                            maxLength={64}
                          />
                          <Button variant="ghost" size="sm" disabled={busy}>
                            保存名称
                          </Button>
                        </form>
                        <p className="text-xs text-muted-foreground">
                          {new Date(key.createdAt).toLocaleDateString("zh-CN")}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || me.passkeys.length <= 1}
                        onClick={() => setRemove(key.id)}
                      >
                        删除
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    disabled={busy || !supported || !options?.passkey}
                    onClick={() => run(() => passkey("add"))}
                  >
                    添加备用密钥
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <ShieldCheck />
                  <CardTitle>
                    <h2>账号恢复</h2>
                  </CardTitle>
                  <CardDescription>
                    密钥全部丢失时，用恢复码创建新密钥。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">
                    {me.recoveryReady
                      ? "恢复码已生成。重新生成会立即作废旧的一组。"
                      : "你还没有恢复码。建议现在生成并妥善保存。"}
                  </p>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const result = await request<RecoveryKit>(
                          "/api/me/recovery-codes",
                          {},
                        );
                        await refresh();
                        setKit(result);
                      })
                    }
                  >
                    {me.recoveryReady ? "重新生成恢复码" : "生成恢复码"}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <Monitor />
                  <CardTitle>
                    <h2>登录设备</h2>
                  </CardTitle>
                  <CardDescription>只保留你仍在使用的设备。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {me.devices.map((device) => (
                    <div key={device.id} className="account-list-row">
                      <div className="min-w-0">
                        <strong>
                          {device.current ? "当前设备" : "其他设备"}
                        </strong>
                        <p className="text-xs text-muted-foreground line-clamp-2 break-all">
                          {device.userAgent?.slice(0, 120) || "未知浏览器"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await request(
                              `/api/me/devices/${device.id}/revoke`,
                              {},
                            );
                            announce();
                            await refresh();
                          })
                        }
                      >
                        退出
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
            <div className="account-data-actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const data = await request("/api/me/export");
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "WG-我的故事.json";
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  })
                }
              >
                导出我的记录
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setDeleteAccount(true)}
              >
                删除账号
              </Button>
            </div>
          </>
        )}
        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <noscript>
          <p>账号登录需要 JavaScript。游客仍可直接访问故事目录。</p>
        </noscript>
      </main>
      <AlertDialog
        open={!!kit}
        onOpenChange={(open) => {
          if (!open) setKit(null);
        }}
      >
        <AlertDialogContent className="account-recovery-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>保存你的恢复码</AlertDialogTitle>
            <AlertDialogDescription>
              这些码只显示一次。请保存到可信的位置；每枚只能用一次，任何持有码的人都能恢复你的账号。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm break-all">账号标识：{kit?.accountId}</p>
          <div className="account-code-grid">
            {kit?.codes.map((code) => (
              <code className="recovery-code" key={code}>
                {code}
              </code>
            ))}
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={downloadKit}>
              下载恢复码
            </Button>
            <AlertDialogAction onClick={() => setKit(null)}>
              我已保存，关闭
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这把通行密钥？</AlertDialogTitle>
            <AlertDialogDescription>
              该密钥将无法再登录。请确认你能使用剩下的密钥。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = remove;
                setRemove(null);
                if (id)
                  void run(async () => {
                    await request(`/api/me/passkeys/${id}/delete`, {});
                    announce();
                    await refresh();
                  });
              }}
            >
              删除密钥
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteAccount} onOpenChange={setDeleteAccount}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除这个账号？</AlertDialogTitle>
            <AlertDialogDescription>
              私人书架、游玩记录、云端备份和所有登录密钥将被移除，此操作无法撤销。请先下载需保留的备份与待上传文件。游戏站点原有的本地存档不会被清除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留账号</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteAccount(false);
                void run(async () => {
                  await request(
                    "/api/me",
                    { confirmation: "DELETE" },
                    "DELETE",
                  );
                  setKit(null);
                  announce();
                  await refresh(true);
                });
              }}
            >
              确认删除账号
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
