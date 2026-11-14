import { ApiResponseError } from "../api/client-base";
import { adminErrorCopy, createModerationClient } from "../api/admin-client";
import { brand } from "../brand";
import { useEffect, useState } from "react";
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
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../components/ui/table";
import type { ShareText, ModerationShare } from "../accounts/share-types";
import { SHARE_PROGRESS } from "../accounts/share-metadata";
import { ContentManagement } from '../accounts/content-management';
type Item = ModerationShare;
function ReviewText({ label, text }: { label: string; text: ShareText }) {
  return (
    <section className="rounded-lg border p-4 space-y-2">
      <h3 className="font-medium">{label}</h3>
      <p className="break-words">标题：{text.title}</p>
      <div className="flex gap-2 flex-wrap text-sm">
        <span>{SHARE_PROGRESS[text.progress]}</span>
        <span>{text.spoiler ? "含剧透说明" : "不含剧透说明"}</span>
      </div>
      <p className="whitespace-pre-wrap break-words">
        {text.description || "作者未填写说明。"}
      </p>
    </section>
  );
}
export function meta() {
  return [
    { title: `分享审核 · ${brand.shortName}` },
    { name: "robots", content: "noindex,nofollow" },
  ];
}
export function ShareAdminPanel({ apiPrefix = "/api/share-admin", binding }: { apiPrefix?: string; binding?: string } = {}) {
  const [logged, setLogged] = useState(false),
    [loadingQueue, setLoadingQueue] = useState(true),
    [token, setToken] = useState(""),
    [items, setItems] = useState<Item[]>([]),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const api=createModerationClient(apiPrefix,{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',headers:{...Object.fromEntries(new Headers(input instanceof Request ? input.headers : undefined)), ...Object.fromEntries(new Headers(init?.headers)),...(binding?{'x-wg-binding':binding}:{})}})});
  async function load() {
    setLoadingQueue(true);
    try {setItems(await api.shareAdminQueue({}));setLogged(true);}
    catch(error){if(error instanceof ApiResponseError && error.status===401)setLogged(false);throw error;}
    finally{setLoadingQueue(false);}
  }
  async function refreshQueue(successMessage = "") {
    try {await load();setMessage(successMessage);}
    catch(error){setMessage(successMessage + '审核队列加载失败，请点击刷新重试。' + adminErrorCopy(error, 'shares'));}
  }
  useEffect(() => { void refreshQueue(); }, []);
  async function moderate(item: Item, action: "approve" | "block" | "resolve") {
    setBusy(true);setMessage("");
    try {
      await api.shareAdminModerate({params:{id:item.id},body:{revision:item.metadataRevision,action,reason}});
      await refreshQueue("审核操作已保存。");
    } catch(error) {
      if(error instanceof ApiResponseError && error.status===401)setLogged(false);
      setMessage(adminErrorCopy(error, 'shares'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container share-shell">
      <p className="eyebrow">{brand.shortName} PRIVATE MODERATION</p>
      <h1>分享审核</h1>
      <p className="text-muted-foreground">
        独立管理权限 · 批准发布不代表实机兼容性验证
      </p>
      {!logged && binding ? (
        <Card><CardHeader><CardTitle>{loadingQueue ? "正在读取审核队列…" : "审核队列暂不可用"}</CardTitle><CardDescription>使用当前管理员账号连接。</CardDescription></CardHeader><CardContent><Button disabled={loadingQueue} onClick={()=>void refreshQueue()}>重试加载</Button></CardContent></Card>
      ) : !logged ? (
        <Card>
          <CardHeader>
            <CardTitle>进入审核后台</CardTitle>
            <CardDescription>使用此私有实例的一次性管理令牌。</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                try {await api.shareAdminLogin({body:{token}});setToken("");await refreshQueue();}
                catch {setMessage("管理令牌无效或已使用。");}

              }}
            >
              <Label htmlFor="share-admin-token">管理令牌</Label>
              <Input
                id="share-admin-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <Button type="submit">进入审核后台</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <ContentManagement request={api} />
          <div className="space-y-2">
            <Label htmlFor="moderation-reason">审核原因</Label>
            <Input
              id="moderation-reason"
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button variant="outline" disabled={loadingQueue || busy} onClick={() => void refreshQueue()}>
              刷新审核队列
            </Button>
          </div>
          {!items.length && <p>暂无待处理条目</p>}
          {items.map((item) => (
            <Card key={item.id} data-share-id={item.id}>
              <CardHeader>
                <CardTitle>{(item.pending || item.approved)?.title}</CardTitle>
                <CardDescription>
                  {item.mode === "public" ? "公开分享" : "链接分享"} · 文案版本{" "}
                  {item.metadataRevision}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <section className="space-y-2 text-sm">
                  <h3 className="font-medium">作品与版本</h3>
                  <p className="break-words">
                    {item.work?.title ?? "作品信息暂不可读取"} · {item.workId}
                  </p>
                  <p className="break-words">
                    {item.version
                      ? `版本 ${item.version.number} · ${item.version.title} · ${item.version.engine}`
                      : "版本信息暂不可读取"}
                  </p>
                  <p className="break-all text-muted-foreground">
                    版本标识：{item.versionId}
                  </p>
                  {item.catalogStatus !== "visible" && (
                    <p role="status">
                      {item.catalogStatus === "hidden"
                        ? "此版本已下线，不能批准发布。"
                        : "游戏目录暂不可用，批准时会重新验证。"}{" "}
                      仍可下架或处理举报。
                    </p>
                  )}
                  <p>发布者：{item.author}</p>
                  <p>
                    创建于 {new Date(item.createdAt).toLocaleString()}
                    {item.expiresAt
                      ? ` · 到期于 ${new Date(item.expiresAt).toLocaleString()}`
                      : " · 长期公开"}
                  </p>
                </section>
                <section className="rounded-lg border p-4 space-y-2 text-sm">
                  <h3 className="font-medium">发布时版本信息</h3>
                  {item.publication ? (
                    <>
                      <p>
                        {item.publication.work.title} ·{" "}
                        {item.publication.work.id}
                      </p>
                      <p>
                        版本 {item.publication.version.number} ·{" "}
                        {item.publication.version.title} ·{" "}
                        {item.publication.version.engine}{item.publication.version.engineReleaseId&&<span> · 新版独立档案 <code title={item.publication.version.engineReleaseId}>{item.publication.version.engineReleaseId.slice(0,20)}</code></span>}
                      </p>
                      <p className="break-all">{item.publication.version.id}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      旧分享未保存发布时版本信息，上方为当前目录信息。
                    </p>
                  )}
                </section>
                <div className="grid gap-3 md:grid-cols-2">
                  {item.approved && (
                    <ReviewText
                      label={
                        item.mode === "public"
                          ? "当前已批准内容"
                          : "当前分享内容"
                      }
                      text={item.approved}
                    />
                  )}
                  {item.pending && (
                    <ReviewText label="待审核内容" text={item.pending} />
                  )}
                </div>
                <section className="space-y-3">
                  <h3 className="font-medium">
                    固定快照文件 · {item.files.length} 个 · {item.bytes} 字节
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    仅展示文件清单；SHA256 校验不代表游戏兼容性或文件隐私审核。
                  </p>
                  <ul className="space-y-3 text-sm">
                    {item.files.map((file) => (
                      <li
                        key={file.name}
                        className="rounded-lg border p-3 space-y-1 min-w-0"
                      >
                        <p className="break-all">{file.name}</p>
                        <p>{file.bytes} 字节</p>
                        <p className="text-xs text-muted-foreground">SHA256</p>
                        <code className="block break-all text-xs">
                          {file.sha256}
                        </code>
                      </li>
                    ))}
                  </ul>
                </section>
                {item.reports.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>举报原因</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {item.reports.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-pre-wrap break-words">
                            {r.reason}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="flex gap-2 flex-wrap">
                  {item.pending && item.mode === "public" && (
                    <Button
                      disabled={busy || !reason.trim()}
                      onClick={() => moderate(item, "approve")}
                    >
                      批准发布
                    </Button>
                  )}
                  {item.reports.length > 0 && (
                    <Button
                      variant="outline"
                      disabled={busy || !reason.trim()}
                      onClick={() => moderate(item, "resolve")}
                    >
                      举报无问题，结案
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    disabled={busy || !reason.trim()}
                    onClick={() => moderate(item, "block")}
                  >
                    下架分享
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </main>
  );
}

export default function ShareAdmin() { return <ShareAdminPanel/>; }
