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
import type { ShareText } from "../accounts/share-types";
type Item = {
  id: string;
  metadataRevision: number;
  mode: string;
  pending: ShareText | null;
  approved: ShareText | null;
  reports: { id: string; reason: string }[];
};
export function meta() {
  return [
    { title: "分享审核 · WG" },
    { name: "robots", content: "noindex,nofollow" },
  ];
}
export default function ShareAdmin() {
  const [logged, setLogged] = useState(false),
    [token, setToken] = useState(""),
    [items, setItems] = useState<Item[]>([]),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/share-admin/queue", {
      cache: "no-store",
    });
    if (response.status === 401) {
      setLogged(false);
      return;
    }
    if (!response.ok) throw new Error("审核队列暂不可用");
    setItems(await response.json());
    setLogged(true);
  }
  useEffect(() => {
    void load().catch(() => setMessage("审核队列暂不可用"));
  }, []);
  async function moderate(item: Item, action: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/share-admin/${item.id}/moderate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: item.metadataRevision,
          action,
          reason,
        }),
      });
      if (!response.ok) {
        setMessage("操作未完成，可能已有更新。请刷新队列。");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container share-shell">
      <p className="eyebrow">WG PRIVATE MODERATION</p>
      <h1>分享审核</h1>
      <p className="text-muted-foreground">
        独立管理权限 · 批准发布不代表实机兼容性验证
      </p>
      {!logged ? (
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
                const response = await fetch("/api/share-admin/login", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ token }),
                });
                setToken("");
                if (response.ok) await load();
                else setMessage("管理令牌无效或已使用。");
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
          <div className="space-y-2">
            <Label htmlFor="moderation-reason">审核原因</Label>
            <Input
              id="moderation-reason"
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button variant="outline" onClick={() => load()}>
              刷新审核队列
            </Button>
          </div>
          {!items.length && <p>暂无待处理条目</p>}
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle>{(item.pending || item.approved)?.title}</CardTitle>
                <CardDescription>
                  {item.mode === "public" ? "公开分享" : "链接分享"} · 文案版本{" "}
                  {item.metadataRevision}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {item.approved && (
                  <p>已批准文案：{item.approved.description}</p>
                )}
                {item.pending && (
                  <p className="whitespace-pre-wrap break-words">
                    待审说明：{item.pending.description}
                  </p>
                )}
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
