import { useEffect, useState } from "react";
import { workSlug, providerLink } from "../identity.ts";
import type { PublicWork, PublicVersion } from "../types.ts";
export function meta() {
  return [
    { title: "WG · 私有管理" },
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
    setItems(await api("catalog"));
    const data = await api("sources");
    setSources(data.entries ?? []);
    setPending(await api("pending"));
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
      <a className="brand" href="/manage">
        WG<span>私有管理</span>
      </a>
      <p className="eyebrow">LOOPBACK ONLY / METADATA & REPORTS</p>
      <h1>作品与版本</h1>
      <p className="muted">这里只编辑目录信息，不启动转换、不删除游戏文件。</p>
      <p role="status" className="status-message">
        {message}
      </p>
      {!logged ? (
        <form
          className="panel"
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
          <label>
            本次服务启动令牌
            <input name="token" type="password" autoComplete="off" required />
          </label>
          <button className="button" disabled={busy}>
            登录管理
          </button>
          <p>令牌只可使用一次。重启服务会使会话失效。</p>
        </form>
      ) : (
        <>
          <div className="filters">
            <label className="search">
              查找作品
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="标题或 v / b 编号"
              />
            </label>
            <button
              onClick={() => reload().catch((e) => setMessage(e.message))}
            >
              刷新列表
            </button>
          </div>
          <p>
            {items.length} 部作品 ·{" "}
            {items.reduce((n, w) => n + w.versions.length, 0)} 条版本记录
          </p>
          {items
            .filter((w) =>
              (w.title + w.id + w.aliases.join(" "))
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((w) => (
              <details key={w.id} className="panel">
                <summary>
                  {w.title}{" "}
                  <span className="muted">
                    {w.id} · {w.versions.length} 个版本 · revision {w.revision}
                  </span>
                </summary>
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
                  <label>
                    显示标题
                    <input name="title" defaultValue={w.title} required />
                  </label>
                  <label>
                    别名（每行一个）
                    <textarea
                      name="aliases"
                      defaultValue={w.aliases.join("\n")}
                    />
                  </label>
                  <label>
                    默认版本
                    <select
                      name="default"
                      defaultValue={w.defaultVersionId ?? ""}
                    >
                      <option value="">不指定</option>
                      {w.versions
                        .filter((v) => (v as any).status === "published")
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.number} · {v.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="button" disabled={busy}>
                    保存作品
                  </button>
                </form>
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
                <details>
                  <summary>登记新版本</summary>
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
                    <label>
                      版本说明
                      <input name="title" required />
                    </label>
                    <label>
                      已存在的资源入口
                      <input
                        name="legacyPath"
                        placeholder="/existing-game/"
                        required
                      />
                    </label>
                    <label>
                      引擎
                      <select name="engine">
                        {["ONS", "Artemis", "RenPy", "Tyrano"].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <button className="button" disabled={busy}>
                      分配下一个编号
                    </button>
                  </form>
                </details>
              </details>
            ))}
          <section className="panel">
            <h2>待确认映射 · {pending.length}</h2>
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
                  <label>
                    已核实并登记的 VNDB / BGM ID
                    <input
                      name="workId"
                      required
                      pattern="[vb][1-9][0-9]{0,8}"
                    />
                  </label>
                  <button disabled={busy}>确认归属并分配版本号</button>
                </form>
              </article>
            ))}
            <details>
              <summary>登记已核实的新作品</summary>
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
                <label>
                  VNDB / BGM ID
                  <input name="id" required pattern="[vb][1-9][0-9]{0,8}" />
                </label>
                <label>
                  显示标题
                  <input name="title" required />
                </label>
                <label>
                  原始标题
                  <input name="originalTitle" required />
                </label>
                <button disabled={busy}>确认登记</button>
              </form>
            </details>
          </section>
          <section className="panel">
            <h2>来源去重与候选</h2>
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
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>原生目录</th>
                    <th>引擎</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s: any) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td>{s.nativeEngineHint}</td>
                      <td>
                        {s.disposition}
                        <small>{s.reason ?? s.existingUrl}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>导入验证报告</h2>
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
              <label>
                报告 JSON
                <textarea
                  name="report"
                  rows={8}
                  required
                  placeholder={
                    '{"versionId":"…","kind":"startup","runId":"…","startedAt":"…","checkedAt":"…","status":"passed","detail":"仅验证菜单"}'
                  }
                />
              </label>
              <button disabled={busy} className="button">
                导入本次记录
              </button>
            </form>
          </section>
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
  return (
    <section className="version-edit">
      <p>
        <b>
          /{workSlug(v.workId)}/{v.number}/
        </b>{" "}
        · {v.engine} · {state}
      </p>
      <small>{v.id}</small>
      <form
        className="edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save({
            title: f.get("title"),
            status: f.get("status"),
            language: f.get("language"),
            notes: f.get("notes"),
            sortOrder: Number(f.get("sortOrder")),
          });
        }}
      >
        <label>
          版本名称
          <input name="title" defaultValue={v.title} required />
        </label>
        <label>
          语言
          <input name="language" defaultValue={v.language} />
        </label>
        <label>
          说明
          <textarea name="notes" defaultValue={v.notes} />
        </label>
        <label>
          展示顺序
          <input
            name="sortOrder"
            type="number"
            min="0"
            max="1000000"
            defaultValue={v.sortOrder}
          />
        </label>
        <label>
          展示状态
          <select name="status" defaultValue={state}>
            <option value="published">已展示</option>
            <option value="hidden">隐藏</option>
            <option value="deleted">删除登记（保留编号与文件）</option>
          </select>
        </label>
        <button disabled={busy || state === "deleted"}>保存版本</button>
      </form>
      <details>
        <summary>纠正作品归属</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            reassign(String(new FormData(e.currentTarget).get("workId")));
          }}
        >
          <label>
            已登记的目标 VNDB / BGM ID
            <input
              name="workId"
              pattern="[vb][1-9][0-9]{0,8}"
              placeholder="v27448"
              required
            />
          </label>
          <button disabled={busy || state === "deleted"}>
            更正并保留旧地址
          </button>
        </form>
      </details>
    </section>
  );
}
