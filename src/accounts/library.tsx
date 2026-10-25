import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { CloudBackups } from "./cloud";
import {Favorites} from './favorites';
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
export function Library({
  account,
  run,
  view = "library",
}: {
  account: Account;
  view?: string;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]),
    [entries, setEntries] = useState<LibraryEntry[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState("");
  const navigate = useNavigate();
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
    <section className="account-library space-y-6" hidden={!["library", "saves"].includes(view)}>
      <div hidden={view !== "library"} className="space-y-6">
      <Favorites account={account}/>
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
                    const check = account.guard();
                    const session = await request<{ id: string }>("/api/me/play-sessions", { versionId, eventId: crypto.randomUUID() });
                    check();
                    const version = work.versions.find(v => v.id === versionId)!;
                    navigate(`${version.url}?session=${encodeURIComponent(session.id)}`);
                  })
                }
              />
            ) : null;
          })}
        </div>
      )}
      </div>
      <div hidden={view !== "saves"}><h2>我的存档</h2><p className="text-sm text-muted-foreground">管理云端备份与历史版本。本机存档在各作品的播放器内管理。</p><CloudBackups account={account} catalog={catalog} run={run} /></div>
      <p hidden={view !== "library"} className="text-sm text-muted-foreground">
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
        <Button onClick={() => start(version)}>{entry.lastVersionId ? "继续阅读" : "开始阅读"}</Button>
      </CardContent>
    </Card>
  );
}
