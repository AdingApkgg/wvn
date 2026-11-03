import { useEffect, useRef, useState } from "react";
import { useContentAccess } from "../content/client";
import type { useAccount } from "./client";
import type { OwnShare, SharePage } from "./share-types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card";
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
import { SHARE_PROGRESS, type ShareProgress } from "./share-metadata";
export function ShareManagement({
  account,
  run,
}: {
  account: ReturnType<typeof useAccount>;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const owner = account.me!.user.id;
  const content = useContentAccess(), scope = content.enabled ? content.access : null;
  const ready = !content.enabled || (!content.loading && !content.pendingPublic);
  const binding = account.me!.binding;
  const current = useRef({ scope, binding, ready });
  current.current = { scope, binding, ready };
  const [loaded, setLoaded] = useState<{ scope: typeof scope; binding: string } | null>(null);
  const visible = !!loaded && ready && loaded.scope === scope && loaded.binding === binding;
  const canEdit = !content.enabled || content.access.canViewRestricted;
  const [items, setItems] = useState<OwnShare[]>([]),
    [next, setNext] = useState<string | null>(null),
    [enabled, setEnabled] = useState(false),
    [revoke, setRevoke] = useState<OwnShare | null>(null),
    [edit, setEdit] = useState<OwnShare | null>(null),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [progress, setProgress] = useState<ShareProgress>("chapter"),
    [spoiler, setSpoiler] = useState(false);
  async function load(cursor?: string) {
    const captured = current.current;
    if (!captured.ready) return;
    const page = await account.request<SharePage<OwnShare>>(
      "/api/me/save-shares" +
        (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      undefined,
      undefined,
      owner,
    );
    if (!current.current.ready || current.current.scope !== captured.scope || current.current.binding !== captured.binding) return;
    setItems((old) => (cursor ? [...old, ...page.items] : page.items));
    setNext(page.next);
    setLoaded({ scope: captured.scope, binding: captured.binding });
  }
  useEffect(() => {
    setEdit(null); setRevoke(null); setTitle(""); setDescription("");
    if (!ready) return;
    let live = true;
    void account
      .request<{ sharing: boolean }>("/api/cloud-options")
      .then(async (options) => {
        if (!live) return;
        setEnabled(options.sharing);
        if (options.sharing) {
          setEnabled(true);
          await load();
        }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [owner, binding, scope, ready, account.request]);
  if (!enabled) return null;
  // 直接移除整个旧展示子树（包括 Portal），不等待 effect 或对话框退场动画。
  if (!visible) return <Card className="account-sharing" id="my-shares"><CardHeader><CardTitle><h2>我的分享</h2></CardTitle></CardHeader><CardContent><p role="status">正在更新分享显示…</p></CardContent></Card>;
  return (
    <Card className="account-sharing" id="my-shares">
      <CardHeader>
        <CardTitle>
          <h2>我的分享</h2>
        </CardTitle>
        <CardDescription>
          从云端备份历史中选择一份存档发布。撤回会阻止新的获取，已领取副本仍然保留。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" onClick={() => run(() => load())}>
          刷新分享列表
        </Button>
        {!items.length && (
          <p className="text-sm text-muted-foreground">还没有发布存档。</p>
        )}
        {items.map((s) => (
          <div className="account-pending space-y-2" key={s.id}>
            <h3>{s.title}</h3>
            <p className="text-sm text-muted-foreground">
              {s.mode === "public" ? "公开分享" : "链接分享"} ·{" "}
              {(
                {
                  active: "有效",
                  pending: "待审核",
                  revoked: "已撤回",
                  expired: "已到期",
                  blocked: "已下架",
                } as Record<string, string>
              )[s.state] ?? s.state}
              {s.pending && s.state === "active" && " · 新文案待审核"}
              {" · "}
              {SHARE_PROGRESS[s.progress]}
              {s.spoiler && " · 含剧透说明"}
            </p>
            <p className="text-xs text-muted-foreground">
              {!canEdit || s.contentRedacted ? "受限文字已隐藏，版本归属保持不变。" : s.metadataBasis === "published"
                ? "版本信息已按发布时保存。"
                : "旧分享未保存发布时版本信息，当前显示目录信息。"}
            </p>
            <div className="flex gap-2 flex-wrap">
              {s.mode === "public" && s.state === "active" && (
                <Button variant="link" asChild>
                  <a href={`/s/${s.id}`}>查看公开详情</a>
                </Button>
              )}
              {["active", "pending"].includes(s.state) && (
                <>
                  <Button
                    variant="outline"
                    disabled={!canEdit || s.contentRedacted}
                    onClick={() => {
                      setEdit(s);
                      const text = s.pending ?? s;
                      setTitle(text.title);
                      setDescription(text.description);
                      setProgress(text.progress);
                      setSpoiler(text.spoiler);
                    }}
                  >
                    编辑分享说明
                  </Button>
                  <Button variant="ghost" onClick={() => setRevoke(s)}>
                    撤回分享
                  </Button>
                </>
              )}
            </div>
            {!canEdit && <p className="text-xs text-muted-foreground">受限文案已隐藏；开启显示后可编辑原说明，撤回操作仍可使用。</p>}
          </div>
        ))}
        {next && (
          <Button variant="outline" onClick={() => run(() => load(next))}>
            加载更早分享
          </Button>
        )}
        <AlertDialog
          open={!!revoke}
          onOpenChange={(open) => {
            if (!open) setRevoke(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>撤回这份分享？</AlertDialogTitle>
              <AlertDialogDescription>
                链接立即失效。其他玩家已成功领取的独立副本不会被删除。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const selected = revoke;
                  setRevoke(null);
                  if (selected)
                    void run(async () => {
                      await account.request(
                        `/api/me/save-shares/${selected.id}/revoke`,
                        {},
                        undefined,
                        owner,
                      );
                      await load();
                    });
                }}
              >
                确认撤回
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog
          open={!!edit}
          onOpenChange={(open) => {
            if (!open) setEdit(null);
          }}
        >
          <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>编辑分享说明</AlertDialogTitle>
              <AlertDialogDescription>
                文件保持原快照。公开文案修改需重新审核，审核前继续显示旧文案。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Label htmlFor="edit-share-title">标题</Label>
            <Input
              id="edit-share-title"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Label htmlFor="edit-share-description">说明</Label>
            <Textarea
              id="edit-share-description"
              value={description}
              maxLength={2000}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Label htmlFor="edit-share-progress">进度类型</Label>
            <select
              id="edit-share-progress"
              value={progress}
              onChange={(e) => setProgress(e.target.value as ShareProgress)}
            >
              {Object.entries(SHARE_PROGRESS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Label
              className="flex items-center gap-2"
              htmlFor="edit-share-spoiler"
            >
              <input
                id="edit-share-spoiler"
                type="checkbox"
                checked={spoiler}
                onChange={(e) => setSpoiler(e.target.checked)}
              />
              含剧透说明
            </Label>
            <Button
              onClick={() => {
                const selected = edit;
                if (selected)
                  void run(async () => {
                    await account.request(
                      `/api/me/save-shares/${selected.id}`,
                      {
                        title,
                        description,
                        progress,
                        spoiler,
                        revision: selected.metadataRevision,
                      },
                      "PATCH",
                      owner,
                    );
                    await load();
                    setEdit(null);
                  });
              }}
            >
              保存说明
            </Button>
            <AlertDialogCancel>取消</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
