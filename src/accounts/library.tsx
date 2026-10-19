import { useEffect, useRef, useState } from "react";
import { CloudBackups } from "./cloud";
import type { useAccount } from "./client";
import type { CatalogItem, LibraryEntry } from "./library.server";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
const statuses = {
  wanted: "想读",
  playing: "在读",
  completed: "已读",
  paused: "搁置",
  dropped: "放弃",
};
type Account = ReturnType<typeof useAccount>;
type Playback = {
  id: string;
  work: CatalogItem;
  version: CatalogItem["versions"][number];
};
export function Library({
  account,
  run,
}: {
  account: Account;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]),
    [entries, setEntries] = useState<LibraryEntry[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [play, setPlay] = useState<Playback | null>(null);
  const { request } = account;
  async function reload() {
    setEntries(await request<LibraryEntry[]>("/api/me/library"));
  }
  useEffect(() => {
    let live = true;
    void Promise.all([
      request<CatalogItem[]>("/api/account-catalog"),
      request<LibraryEntry[]>("/api/me/library"),
    ])
      .then(([works, items]) => {
        if (live) {
          setCatalog(works);
          setEntries(items);
        }
      })
      .catch(() => {
        if (live) account.setError("私人书架暂时无法读取，请刷新重试。");
      });
    return () => {
      live = false;
    };
  }, [request]);
  const matches = catalog.filter((w) =>
    w.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="account-library space-y-6">
      <div className="space-y-3">
        <h2>私人书架</h2>
        <Label htmlFor="library-search">寻找一部故事</Label>
        <Input
          id="library-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按标题筛选"
        />
        <div className="flex flex-wrap gap-3">
          <NativeSelect
            aria-label="选择故事"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <NativeSelectOption value="">选择一部故事…</NativeSelectOption>
            {matches.map((w) => (
              <NativeSelectOption key={w.id} value={w.id}>
                {w.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            disabled={!selected}
            onClick={() =>
              run(async () => {
                const existing = entries.find((e) => e.workId === selected);
                await request(
                  `/api/me/library/${selected}`,
                  {
                    revision: existing?.revision ?? 0,
                    status: existing?.status ?? "wanted",
                    note: existing?.note ?? "",
                  },
                  "PATCH",
                );
                await reload();
              })
            }
          >
            加入书架
          </Button>
        </div>
      </div>
      {play && (
        <AccountPlayer
          play={play}
          account={account}
          close={() => {
            setPlay(null);
            void run(reload);
          }}
        />
      )}
      {entries.length === 0 ? (
        <p className="text-muted-foreground">
          书架还空着。选一部故事，让下一次重逢有迹可循。
        </p>
      ) : (
        <div className="account-grid">
          {entries.map((entry) => {
            const work = catalog.find((w) => w.id === entry.workId);
            return work ? (
              <Book
                key={`${entry.workId}:${entry.revision}`}
                entry={entry}
                work={work}
                save={(status, note) =>
                  run(async () => {
                    await request(
                      `/api/me/library/${work.id}`,
                      { revision: entry.revision, status, note },
                      "PATCH",
                    );
                    await reload();
                  })
                }
                start={(versionId) =>
                  run(async () => {
                    const session = await request<{ id: string }>(
                      "/api/me/play-sessions",
                      { versionId, eventId: crypto.randomUUID() },
                    );
                    setPlay({
                      id: session.id,
                      work,
                      version: work.versions.find((v) => v.id === versionId)!,
                    });
                    await reload();
                  })
                }
              />
            ) : null;
          })}
        </div>
      )}
      <CloudBackups account={account} catalog={catalog} run={run} />
      <p className="text-sm text-muted-foreground">
        游玩时长是前台停留的估算。自动存档同步尚未启用，游戏内仍需手动保存。
      </p>
    </section>
  );
}
function Book({
  entry,
  work,
  save,
  start,
}: {
  entry: LibraryEntry;
  work: CatalogItem;
  save: (status: string, note: string) => void;
  start: (versionId: string) => void;
}) {
  const [status, setStatus] = useState(entry.status),
    [note, setNote] = useState(entry.note),
    [version, setVersion] = useState(
      entry.lastVersionId ?? work.versions[0].id,
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{work.title}</h3>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          已记录约 {Math.floor(entry.seconds / 60)} 分钟
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save(status, note);
          }}
        >
          <NativeSelect
            aria-label={`${work.title} 阅读状态`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {Object.entries(statuses).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Label htmlFor={`note-${work.id}`}>私人笔记</Label>
          <Textarea
            id={`note-${work.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={5000}
            placeholder="记下上次停在哪一章…"
          />
          <Button variant="outline" size="sm">
            保存记录
          </Button>
        </form>
        <NativeSelect
          aria-label={`${work.title} 游玩版本`}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        >
          {work.versions.map((v) => (
            <NativeSelectOption key={v.id} value={v.id}>
              版本 {v.number} · {v.engine} · {v.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button onClick={() => start(version)}>继续阅读</Button>
      </CardContent>
    </Card>
  );
}
function AccountPlayer({
  play,
  account,
  close,
}: {
  play: Playback;
  account: Account;
  close: () => void;
}) {
  const sequence = useRef(0),
    lastInput = useRef(Date.now());
  const [ready, setReady] = useState(false),
    [idle, setIdle] = useState(false),
    [online, setOnline] = useState(true);
  useEffect(() => {
    const pulse = () => {
      const inactive = Date.now() - lastInput.current >= 300_000;
      setIdle(inactive);
      const active =
        ready &&
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        !inactive;
      void account
        .request(`/api/me/play-sessions/${play.id}/heartbeat`, {
          seq: ++sequence.current,
          active,
        })
        .then(() => setOnline(true))
        .catch(() => setOnline(false));
    };
    const input = () => {
      lastInput.current = Date.now();
    };
    const timer = setInterval(pulse, 30_000);
    pulse();
    document.addEventListener("visibilitychange", pulse);
    window.addEventListener("pointerdown", input);
    window.addEventListener("keydown", input);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", pulse);
      window.removeEventListener("pointerdown", input);
      window.removeEventListener("keydown", input);
      void account
        .request(`/api/me/play-sessions/${play.id}/heartbeat`, {
          seq: ++sequence.current,
          active: false,
        })
        .catch(() => {});
    };
  }, [play.id, account.request, ready]);
  const url = "https://wg.saop.cc" + play.version.url;
  return (
    <Card className="account-reader">
      <CardHeader>
        <CardTitle>
          {play.work.title} · 版本 {play.version.number}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={close}>
            结束本次阅读
          </Button>
          <Button
            variant="outline"
            disabled={ready && !idle}
            onClick={() => {
              lastInput.current = Date.now();
              setIdle(false);
              setReady(true);
            }}
          >
            {!ready
              ? "画面已就绪，开始记录"
              : idle
                ? "继续记录时间"
                : "正在记录前台时间"}
          </Button>
          <Button variant="link" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              在原入口打开
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <iframe
          title={`${play.work.title} 阅读画面`}
          src={url}
          allow="autoplay; fullscreen; cross-origin-isolated"
          allowFullScreen
        />
        {!online && <p role="status">计时连接中断，断线时长暂未计入。</p>}
        <p className="text-sm text-muted-foreground mt-3">
          若画面无法载入，可使用原入口。原浏览器存档仍保留在游戏站点；此处暂不自动上传或恢复。请确认游戏可正常阅读后开始记录；长时间无操作会暂停计时。
        </p>
      </CardContent>
    </Card>
  );
}
