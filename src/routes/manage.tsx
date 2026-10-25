import { brand } from "../brand";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Card, CardHeader, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../components/ui/accordion";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../components/ui/table";
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
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { metadataSourceLabel } from "../metadata-sources.ts";
import { workSlug, providerLink } from "../identity.ts";
import type { PublicWork, PublicVersion } from "../types.ts";
export function meta() {
  return [
    { title: `${brand.shortName} · 私有管理` },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
export default function Manage() {
  const [items, setItems] = useState<PublicWork[]>([]),
    [sources, setSources] = useState<any[]>([]),
    [pending, setPending] = useState<any[]>([]),
    [logged, setLogged] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  async function api(path: string, method = "GET", body?: unknown) {
    const r = await fetch("/api/manage/" + path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok)
      throw Error(
        r.status === 409
          ? "记录已变化，请刷新列表后重新应用编辑；输入已保留。"
          : (data.error ?? "请求失败"),
      );
    return data;
  }
  async function reload() {
    const [catalog, data, unresolved] = await Promise.all([
      api("catalog"),
      api("sources"),
      api("pending"),
    ]);
    setItems(catalog);
    setSources(data.entries ?? []);
    setPending(unresolved);
    setLogged(true);
  }
  useEffect(() => {
    reload().catch(() => {});
  }, []);
  async function act(fn: () => Promise<any>) {
    setBusy(true);
    try {
      await fn();
      setMessage("已保存");
      await reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container manage">
      <div className="admin-heading">
        <a className="brand" href="/manage">
          {brand.shortName}<span>私有管理</span>
        </a>
        <Badge variant="outline">私有管理</Badge>
      </div>
      <h1>作品与版本</h1>
      <p className="muted">这里只编辑目录信息，不启动转换、不删除游戏文件。</p>
      <div role="status" aria-live="polite" className="status-message">
        {message && (
          <Alert variant={message === "已保存" ? "default" : "destructive"}>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
      </div>
      {!logged ? (
        <Card className="login-panel">
          <CardHeader>
            <h2>登录目录管理</h2>
            <p className="muted">输入本次启动令牌，继续管理作品与版本。</p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const token = new FormData(form).get("token");
                await act(async () => {
                  await api("login", "POST", { token });
                  form.reset();
                });
              }}
            >
              <Label className="field">
                本次服务启动令牌
                <Input
                  name="token"
                  type="password"
                  autoComplete="off"
                  required
                />
              </Label>
              <Button disabled={busy}>登录管理</Button>
              <p className="muted mt-4">
                令牌只可使用一次。重启服务会使会话失效。
              </p>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="admin-stats">
            <Card>
              <CardContent>
                <span>作品</span>
                <strong>{items.length}</strong>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <span>版本</span>
                <strong>
                  {items.reduce((n, w) => n + w.versions.length, 0)}
                </strong>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <span>待确认映射</span>
                <strong>{pending.length}</strong>
              </CardContent>
            </Card>
          </div>
          <Tabs defaultValue="catalog" className="admin-tabs">
            <TabsList aria-label="管理内容">
              <TabsTrigger value="catalog">作品与版本</TabsTrigger>
              <TabsTrigger value="sources">来源与映射</TabsTrigger>
              <TabsTrigger value="reports">验证报告</TabsTrigger>
            </TabsList>
            <TabsContent
              value="catalog"
              forceMount
              className="data-[state=inactive]:hidden"
            >
              <div className="filters">
                <Label className="field search">
                  查找作品
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="标题或 v / b 编号"
                  />
                </Label>
                <Button
                  onClick={() => reload().catch((e) => setMessage(e.message))}
                >
                  刷新列表
                </Button>
              </div>
              <p>
                {items.length} 部作品 ·{" "}
                {items.reduce((n, w) => n + w.versions.length, 0)} 条版本记录
              </p>
              <Accordion type="multiple" className="work-editors">
                {items
                  .filter((w) =>
                    (w.title + w.id + w.aliases.join(" "))
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((w) => (
                    <AccordionItem
                      key={w.id}
                      value={w.id}
                      data-work-id={w.id}
                      className="work-editor"
                    >
                      <AccordionTrigger>
                        {w.title}{" "}
                        <span className="muted">
                          {w.id} · {w.versions.length} 个版本 · revision{" "}
                          {w.revision}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent
                        forceMount
                        className="data-[state=closed]:hidden"
                      >
                        <form
                          key={w.id}
                          className="edit-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            act(() =>
                              api("works/" + w.id, "PATCH", {
                                revision: w.revision,
                                patch: {
                                  title: f.get("title"),
                                  aliases: String(f.get("aliases"))
                                    .split("\n")
                                    .map((x) => x.trim())
                                    .filter(Boolean),
                                  defaultVersionId: f.get("default") || null,
                                },
                              }),
                            );
                          }}
                        >
                          <Label className="field">
                            显示标题
                            <Input
                              name="title"
                              defaultValue={w.title}
                              required
                            />
                          </Label>
                          <Label className="field">
                            别名（每行一个）
                            <Textarea
                              name="aliases"
                              defaultValue={w.aliases.join("\n")}
                            />
                          </Label>
                          <Label className="field">
                            默认版本
                            <NativeSelect
                              name="default"
                              defaultValue={w.defaultVersionId ?? ""}
                            >
                              <NativeSelectOption value="">
                                不指定
                              </NativeSelectOption>
                              {w.versions
                                .filter(
                                  (v) => (v as any).status === "published",
                                )
                                .map((v) => (
                                  <NativeSelectOption key={v.id} value={v.id}>
                                    {v.number} · {v.title}
                                  </NativeSelectOption>
                                ))}
                            </NativeSelect>
                          </Label>
                          <Button disabled={busy}>保存作品</Button>
                        </form>
                        {w.metadata && (
                          <div className="metadata-admin-summary">
                            <Badge variant="secondary">来源资料</Badge>
                            <p>
                              {w.metadata.titles.length} 个标题 ·{" "}
                              {w.metadata.cover ? "封面已缓存" : "暂无封面"} ·{" "}
                              {w.metadata.screenshots.length} 张截图 ·{" "}
                              {w.metadata.tags.length} 个标签
                            </p>
                            <p className="muted">
                              来源：
                              {w.metadata.sources
                                .map((s) => metadataSourceLabel(s.provider, s.id))
                                .join(" / ")}{" "}
                              · {w.metadata.fetchedAt.slice(0, 10)}
                              。来源资料单独保存，不覆盖上面的人工编辑。
                            </p>
                          </div>
                        )}
                        <h3>已有版本</h3>
                        {w.versions.map((v) => (
                          <VersionEditor
                            key={v.id}
                            v={v}
                            busy={busy}
                            save={(patch) =>
                              act(() =>
                                api("versions/" + v.id, "PATCH", {
                                  revision: v.revision,
                                  patch,
                                }),
                              )
                            }
                            reassign={(id) =>
                              act(() =>
                                api("versions/" + v.id + "/reassign", "POST", {
                                  revision: v.revision,
                                  workId: id,
                                }),
                              )
                            }
                          />
                        ))}
                        <Disclosure title="登记新版本">
                          <form
                            className="edit-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              act(() =>
                                api(
                                  "works/" + w.id + "/versions",
                                  "POST",
                                  Object.fromEntries(f),
                                ),
                              );
                            }}
                          >
                            <Label className="field">
                              版本说明
                              <Input name="title" required />
                            </Label>
                            <Label className="field">
                              已存在的资源入口
                              <Input
                                name="legacyPath"
                                placeholder="/existing-game/"
                                required
                              />
                            </Label>
                            <Label className="field">
                              引擎
                              <NativeSelect name="engine">
                                {["ONS", "Artemis", "RenPy", "Tyrano"].map(
                                  (x) => (
                                    <NativeSelectOption key={x}>
                                      {x}
                                    </NativeSelectOption>
                                  ),
                                )}
                              </NativeSelect>
                            </Label>
                            <Button disabled={busy}>分配下一个编号</Button>
                          </form>
                        </Disclosure>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            </TabsContent>
            <TabsContent
              value="sources"
              forceMount
              className="data-[state=inactive]:hidden"
            >
              <AdminPanel title={"待确认映射 · " + pending.length}>
                {!pending.length && <p>所有目录条目均已确认归属。</p>}
                {pending.map((p) => (
                  <article key={p.id}>
                    <h3>{p.title}</h3>
                    <p>{p.reason}</p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        act(() =>
                          api("pending/" + p.id + "/assign", "POST", {
                            workId: f.get("workId"),
                          }),
                        );
                      }}
                    >
                      <Label className="field">
                        已核实并登记的 VNDB / BGM ID
                        <Input
                          name="workId"
                          required
                          pattern="[vb][1-9][0-9]{0,8}"
                        />
                      </Label>
                      <Button disabled={busy}>确认归属并分配版本号</Button>
                    </form>
                  </article>
                ))}
                <Disclosure title="登记已核实的新作品">
                  <p>
                    请先人工核对 VNDB 或 BGM 条目（v / b
                    前缀）；此操作不会自动选择搜索首项。
                  </p>
                  <form
                    className="edit-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      act(() =>
                        api("works", "POST", {
                          id: f.get("id"),
                          title: f.get("title"),
                          originalTitle: f.get("originalTitle"),
                          aliases: [],
                          evidence: providerLink(String(f.get("id"))),
                        }),
                      );
                    }}
                  >
                    <Label className="field">
                      VNDB / BGM ID
                      <Input name="id" required pattern="[vb][1-9][0-9]{0,8}" />
                    </Label>
                    <Label className="field">
                      显示标题
                      <Input name="title" required />
                    </Label>
                    <Label className="field">
                      原始标题
                      <Input name="originalTitle" required />
                    </Label>
                    <Button disabled={busy}>确认登记</Button>
                  </form>
                </Disclosure>
              </AdminPanel>
              <AdminPanel title="来源去重与候选">
                <Button asChild variant="outline" className="mb-4">
                  <a
                    download="wg-candidates.json"
                    href={
                      "data:application/json;charset=utf-8," +
                      encodeURIComponent(
                        JSON.stringify(
                          sources.filter((x) => x.disposition === "eligible"),
                          null,
                          2,
                        ),
                      )
                    }
                  >
                    导出已确认候选 JSON
                  </a>
                </Button>
                <div className="table-wrap">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>原生目录</TableHead>
                        <TableHead>引擎</TableHead>
                        <TableHead>判定</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sources.map((s: any) => (
                        <TableRow key={s.name}>
                          <TableCell>{s.name}</TableCell>
                          <TableCell>{s.nativeEngineHint}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                s.disposition === "eligible"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {s.disposition}
                            </Badge>
                            <small>{s.reason ?? s.existingUrl}</small>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </AdminPanel>
            </TabsContent>
            <TabsContent
              value="reports"
              forceMount
              className="data-[state=inactive]:hidden"
            >
              <AdminPanel title="导入验证报告">
                <p>
                  资源、HTTP、启动报告分别记录；必须提供版本
                  UUID、本轮开始时间和检查时间。拒绝较旧的报告。
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act(async () => {
                      let value;
                      try {
                        value = JSON.parse(String(f.get("report")));
                      } catch {
                        throw Error("JSON 格式无效");
                      }
                      await api("reports", "POST", value);
                    });
                  }}
                >
                  <Label className="field">
                    报告 JSON
                    <Textarea
                      name="report"
                      rows={8}
                      required
                      placeholder={
                        '{"versionId":"…","kind":"startup","runId":"…","startedAt":"…","checkedAt":"…","status":"passed","detail":"仅验证菜单"}'
                      }
                    />
                  </Label>
                  <Button disabled={busy}>导入本次记录</Button>
                </form>
              </AdminPanel>
            </TabsContent>
          </Tabs>
        </>
      )}
    </main>
  );
}
function VersionEditor({
  v,
  busy,
  save,
  reassign,
}: {
  v: PublicVersion;
  busy: boolean;
  save: (patch: any) => void;
  reassign: (id: string) => void;
}) {
  const state = (v as any).status;
  const [deletion, setDeletion] = useState<Record<string, unknown> | null>(
    null,
  );
  return (
    <section className="version-edit">
      <p>
        <b>
          /{workSlug(v.workId)}/{v.number}/
        </b>{" "}
        · {v.engine}{" "}
        <Badge variant={state === "published" ? "secondary" : "outline"}>
          {
            (
              {
                published: "已展示",
                hidden: "隐藏",
                deleted: "已删除登记",
              } as Record<string, string>
            )[state]
          }
        </Badge>
      </p>
      <small>{v.id}</small>
      <form
        className="edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const patch = {
            title: f.get("title"),
            status: f.get("status"),
            language: f.get("language"),
            notes: f.get("notes"),
            sortOrder: Number(f.get("sortOrder")),
          };
          if (patch.status === "deleted") setDeletion(patch);
          else save(patch);
        }}
      >
        <Label className="field">
          版本名称
          <Input name="title" defaultValue={v.title} required />
        </Label>
        <Label className="field">
          语言
          <Input name="language" defaultValue={v.language} />
        </Label>
        <Label className="field">
          说明
          <Textarea name="notes" defaultValue={v.notes} />
        </Label>
        <Label className="field">
          展示顺序
          <Input
            name="sortOrder"
            type="number"
            min="0"
            max="1000000"
            defaultValue={v.sortOrder}
          />
        </Label>
        <Label className="field">
          展示状态
          <NativeSelect name="status" defaultValue={state}>
            <NativeSelectOption value="published">已展示</NativeSelectOption>
            <NativeSelectOption value="hidden">隐藏</NativeSelectOption>
            <NativeSelectOption value="deleted">
              删除登记（保留编号与文件）
            </NativeSelectOption>
          </NativeSelect>
        </Label>
        <Button disabled={busy || state === "deleted"}>保存版本</Button>
      </form>
      <Disclosure title="纠正作品归属">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            reassign(String(new FormData(e.currentTarget).get("workId")));
          }}
        >
          <Label className="field">
            已登记的目标 VNDB / BGM ID
            <Input
              name="workId"
              pattern="[vb][1-9][0-9]{0,8}"
              placeholder="v27448"
              required
            />
          </Label>
          <Button disabled={busy || state === "deleted"}>
            更正并保留旧地址
          </Button>
        </form>
      </Disclosure>
      <AlertDialog
        open={!!deletion}
        onOpenChange={(open) => {
          if (!open) setDeletion(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除此版本的目录登记？</AlertDialogTitle>
            <AlertDialogDescription>
              版本将从公开目录移除。编号和游戏文件会保留，此编号不会再次分配。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deletion) save(deletion);
              }}
            >
              确认删除登记
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function AdminPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="admin-panel">
      <CardHeader>
        <h2>{title}</h2>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function Disclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Accordion type="multiple">
      <AccordionItem value="section">
        <AccordionTrigger>{title}</AccordionTrigger>
        <AccordionContent forceMount className="data-[state=closed]:hidden">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
