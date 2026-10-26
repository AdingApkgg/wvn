import { SHARE_PROGRESS } from "./share-metadata";
import { useEffect, useRef, useState } from "react";
import type { useAccount } from "./client";
import { errorCopy, AccountClientError } from "./client";
import type { SaveProfile, SaveRevision } from "./saves.server";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
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
  AlertDialogCancel,
} from "../components/ui/alert-dialog";
export function SharePublish({
  account,
  profile,
  revision,
  versionTitle,
  close,
}: {
  account: ReturnType<typeof useAccount>;
  profile: SaveProfile;
  revision: SaveRevision;
  versionTitle: string;
  close: () => void;
}) {
  const owner = account.me!.user.id;
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [progress, setProgress] = useState("chapter"),
    [mode, setMode] = useState("link"),
    [days, setDays] = useState("30"),
    [spoiler, setSpoiler] = useState(true),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(""),
    [message, setMessage] = useState("");
  const capture = useRef({ payload: "", id: "" });
  useEffect(() => {
    const clear = () => {
      setLink("");
      close();
    };
    window.addEventListener("wg-account-invalidated", clear);
    return () => window.removeEventListener("wg-account-invalidated", clear);
  }, []);
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {link ? "保存分享链接" : "分享这份存档"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            分享的是这份固定快照，后续保存不会改变它。文件、全局进度和设置可能一同分享。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {link ? (
          <div className="space-y-4">
            <Label htmlFor="share-created-link">完整分享链接</Label>
            <Input id="share-created-link" readOnly value={link} />
            <p className="text-sm text-muted-foreground">
              完整链接只显示这一次。持有者可以转发；撤回后已领取的副本仍会保留。
            </p>
            <Button onClick={close}>已保存链接</Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!confirmed || busy) return;
              setBusy(true);
              setMessage("");
              const body = {
                profileId: profile.id,
                generation: profile.generation,
                revisionId: revision.id,
                title,
                description,
                progress,
                mode,
                days: Number(days),
                spoiler,
              };
              const payload = JSON.stringify(body);
              if (capture.current.payload !== payload)
                capture.current = { payload, id: crypto.randomUUID() };
              try {
                const result = await account.request<{
                  id: string;
                  secret?: string;
                  state: string;
                  duplicate?: boolean;
                }>(
                  "/api/me/save-shares",
                  { ...body, requestId: capture.current.id },
                  undefined,
                  owner,
                );
                if (result.duplicate)
                  setMessage(
                    mode === "link"
                      ? "这份快照已有有效链接分享，未重复创建。"
                      : "这份快照已有公开分享或待审条目，未重复创建。",
                  );
                else if (result.secret)
                  setLink(
                    `${location.origin}/s/${result.id}#key=${result.secret}`,
                  );
                else if (mode === "public")
                  setMessage("已提交审核，通过后出现在作品页。");
                else
                  setMessage(
                    "完整链接未能再次取得，请到我的分享撤回后重新创建。",
                  );
              } catch (error) {
                setMessage(
                  errorCopy(
                    error instanceof AccountClientError
                      ? error.code
                      : "NETWORK",
                  ),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="text-sm space-y-1">
              <p>版本：{versionTitle}</p>{profile.engineReleaseId&&<p>新版独立档案 · <code title={profile.engineReleaseId}>{profile.engineReleaseId.slice(0,20)}</code></p>}
              <p>
                {revision.files.length} 个文件 ·{" "}
                {revision.files.reduce((n, f) => n + f.bytes, 0)} 字节
              </p>
              <ul className="max-h-24 overflow-auto">
                {revision.files.map((f) => (
                  <li className="break-all" key={f.name}>
                    {f.name}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-title">分享标题</Label>
              <Input
                id="share-title"
                required
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-description">分享说明</Label>
              <Textarea
                id="share-description"
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-progress">进度类型</Label>
              <NativeSelect
                id="share-progress"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
              >
                {Object.entries(SHARE_PROGRESS).map(([v, t]) => (
                  <NativeSelectOption key={v} value={v}>
                    {t}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-mode">分享方式</Label>
              <NativeSelect
                id="share-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <NativeSelectOption value="link">
                  链接分享 · 不公开列出
                </NativeSelectOption>
                <NativeSelectOption value="public">
                  公开分享 · 审核后展示
                </NativeSelectOption>
              </NativeSelect>
            </div>
            {mode === "link" && (
              <div className="space-y-2">
                <Label htmlFor="share-days">有效期</Label>
                <NativeSelect
                  id="share-days"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                >
                  {[1, 7, 30].map((n) => (
                    <NativeSelectOption key={n} value={n}>
                      {n} 天
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            <Label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={spoiler}
                onChange={(e) => setSpoiler(e.target.checked)}
              />
              包含剧透，默认折叠说明
            </Label>
            <Label className="flex gap-2 items-start">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              我确认分享所列文件
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !confirmed}>
                {busy ? "正在创建…" : "创建分享"}
              </Button>
              <AlertDialogCancel>关闭</AlertDialogCancel>
            </div>
            {message && (
              <div className="space-y-2">
                <p role="status" className="text-sm">
                  {message}
                </p>
                {message.startsWith("这份快照已有") && (
                  <p className="text-xs text-muted-foreground">
                    原文案和有效期保持不变。完整链接只在首次创建时显示；已有链接继续有效，遗失后可先撤回再重建。
                    <a className="underline ml-1" href="/account#my-shares">
                      管理我的分享
                    </a>
                  </p>
                )}
              </div>
            )}
          </form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
