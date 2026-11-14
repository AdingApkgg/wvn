import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { brand } from "../brand";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import type { ReaderAccount } from "./account-consumer";
import type {
  InternalStatisticsView,
  StatisticCount,
} from "./dashboard-statistics";

const number = (n: number) => n.toLocaleString("zh-CN");
const bytes = (n: number) => {
  const unit =
    n >= 1024 ** 3 ? "GiB" : n >= 1024 ** 2 ? "MiB" : n >= 1024 ? "KiB" : "B";
  const size = { GiB: 1024 ** 3, MiB: 1024 ** 2, KiB: 1024, B: 1 }[unit];
  return `${(n / size).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} ${unit}`;
};
const labels: Record<string, string> = {
  wanted: "想读",
  playing: "在读",
  completed: "读完",
  paused: "暂停",
  dropped: "放弃",
  other: "其他",
  active: "已启用",
  pending: "待审",
  expired: "已过期",
  revoked: "已撤回",
  blocked: "已封禁",
  qualified: "已取得资格",
  unqualified: "未取得资格",
  suspended: "资格暂停",
  needs_retest: "需要重测",
  published: "已发布",
  hidden: "已隐藏",
  deleted: "已删除",
  sfw: "全年龄",
  nsfw: "限制级",
  unknown: "待确认",
};
const colors = [
  "var(--md-sys-color-primary)",
  "#3b8273",
  "#aa641d",
  "#8c63ae",
  "#c05260",
];
function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="statistics-panel">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function Table({
  headers,
  rows,
  rowKeys,
}: {
  headers: string[];
  rows: ReactNode[][];
  rowKeys?: string[];
}) {
  return (
    <section
      className="statistics-table"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 使键盘用户可以横向滚动窄屏数据表。
      tabIndex={0}
      aria-label={headers.join("、")}
    >
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKeys?.[i] ?? String(row[0])}>
              {row.map((cell, j) => (
                <td key={headers[j]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function Distribution({
  title,
  rows,
}: {
  title: string;
  rows: StatisticCount[] | undefined;
}) {
  if (!rows)
    return (
      <Panel title={title}>
        <p>目录暂不可用</p>
      </Panel>
    );
  const data = rows.map((r) => ({
    name: labels[r.key] ?? r.key,
    count: r.count,
  }));
  return (
    <Panel title={title}>
      {!data.some((r) => r.count) ? (
        <p className="statistics-empty">暂无记录</p>
      ) : (
        <div
          className="statistics-chart"
          role="img"
          aria-label={title + "分布，详细数值见下方表格"}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="currentColor"
                opacity={0.12}
              />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
              <YAxis allowDecimals={false} width={40} />
              <Tooltip
                cursor={{ fill: "var(--md-sys-color-surface-container)" }}
                contentStyle={{
                  background: "var(--md-sys-color-surface)",
                  color: "var(--md-sys-color-on-surface)",
                  borderRadius: 12,
                }}
              />
              <Bar
                dataKey="count"
                name="数量"
                fill={colors[0]}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <details>
        <summary>查看{title}数据</summary>
        <Table
          headers={["状态", "数量"]}
          rows={data.map((r) => [r.name, number(r.count)])}
        />
      </details>
    </Panel>
  );
}
export default function StatisticsOverview({
  account,
}: {
  account: ReaderAccount;
}) {
  const [days, setDays] = useState<7 | 30 | 90>(30),
    [reload, setReload] = useState(0),
    [data, setData] = useState<InternalStatisticsView | null>(null),
    [error, setError] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload 用于手动刷新相同统计范围。
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    void account.api
      .dashStatistics({ query: { days: String(days) as "7" | "30" | "90" } })
      .then((value) => {
        if (live) setData(value);
      })
      .catch(() => {
        if (live) setError("内部统计暂时无法读取，请重试。");
      });
    return () => {
      live = false;
    };
  }, [days, reload, account.api]);
  const t = data?.totals;
  return (
    <main className="container statistics-overview">
      <p className="eyebrow">{brand.shortName} ADMIN</p>
      <h1>全站概览</h1>
      <p className="text-muted-foreground">
        账号、阅读、存档与审核的内部业务统计。
      </p>
      <div className="statistics-toolbar">
        <label htmlFor="statistics-days">趋势范围</label>
        <select
          id="statistics-days"
          value={days}
          onChange={(e) => setDays(Number(e.target.value) as 7 | 30 | 90)}
        >
          {[7, 30, 90].map((n) => (
            <option key={n} value={n}>
              最近 {n} 天
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
          刷新概览
        </Button>
      </div>
      <p role="status">
        {error ||
          (!data
            ? "正在读取统计…"
            : `更新于 ${new Date(data.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（北京时间）`)}
      </p>
      {error && (
        <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
          重试
        </Button>
      )}
      {data && t && (
        <>
          <div className="dashboard-stats">
            {(
              [
                ["作品", data.catalog?.works],
                ["版本", data.catalog?.versions],
                ["用户", t.users],
                ["待审分享", t.pendingReviews],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle>{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <strong>
                    {value === undefined ? "暂不可用" : number(value)}
                  </strong>
                </CardContent>
              </Card>
            ))}
          </div>
          {!data.catalog && (
            <p role="status">作品目录暂不可用，账号及其他内部统计仍可查看。</p>
          )}
          <h2>最近 {days} 天</h2>
          <p className="text-sm text-muted-foreground">
            按北京时间自然日汇总，包含今天截至更新时间的记录。
          </p>
          <div className="statistics-grid">
            <Panel
              title="注册与阅读启动"
              description={`新增用户 ${number(data.window.newUsers)} · 阅读启动 ${number(data.window.readingStarts)}`}
            >
              <div
                className="statistics-chart"
                role="img"
                aria-label="每日新增用户与阅读启动，详细数值见趋势数据表"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.trend}
                    margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="currentColor"
                      opacity={0.12}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => v.slice(5)}
                      minTickGap={24}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} width={40} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--md-sys-color-surface)",
                        color: "var(--md-sys-color-on-surface)",
                        borderRadius: 12,
                      }}
                    />
                    <Legend />
                    {(["newUsers", "readingStarts"] as const).map((key, i) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={i ? "阅读启动" : "新增用户"}
                        stroke={colors[i]}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel
              title="存档、分享与管理操作"
              description={`存档版本 ${number(data.window.saveRevisions)} · 创建分享 ${number(data.window.shares)} · 后台操作 ${number(data.window.operations)}`}
            >
              <div
                className="statistics-chart"
                role="img"
                aria-label="每日存档、分享与管理操作，详细数值见趋势数据表"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.trend}
                    margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="currentColor"
                      opacity={0.12}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => v.slice(5)}
                      minTickGap={24}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} width={40} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--md-sys-color-surface)",
                        color: "var(--md-sys-color-on-surface)",
                        borderRadius: 12,
                      }}
                    />
                    <Legend />
                    {(["saveRevisions", "shares", "operations"] as const).map(
                      (key, i) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          name={["存档版本", "创建分享", "后台操作"][i]}
                          fill={colors[i + 1]}
                          isAnimationActive={false}
                        />
                      ),
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
          <details className="statistics-trend-table">
            <summary>查看每日趋势数据</summary>
            <Table
              headers={[
                "日期",
                "新增用户",
                "阅读启动",
                "存档版本",
                "创建分享",
                "后台操作",
              ]}
              rows={data.trend.map((d) => [
                d.date,
                ...[
                  d.newUsers,
                  d.readingStarts,
                  d.saveRevisions,
                  d.shares,
                  d.operations,
                ].map(number),
              ])}
            />
          </details>
          <h2>累计与当前状态</h2>
          <p className="text-sm text-muted-foreground">
            以下为当前或累计数据，不随趋势范围改变。
          </p>
          <div className="statistics-metrics">
            {(
              [
                [
                  "累计阅读时长",
                  `${(t.readingSeconds / 3600).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 小时`,
                ],
                ["累计阅读启动", number(t.readingStarts)],
                ["近 15 分钟阅读用户", number(t.recentReaders)],
                ["内部阅读计数", number(t.internalReads)],
                ["书架条目", number(t.libraryEntries)],
                ["点赞 / 收藏", `${number(t.likes)} / ${number(t.favorites)}`],
                ["存档配置", number(t.saveProfiles)],
                ["存档历史版本", number(t.saveRevisions)],
                ["被引用存档容量", bytes(t.referencedSaveBytes)],
                ["已登记存档容量", bytes(t.registeredSaveBytes)],
                ["未过期启用分享", number(t.activeShares)],
                ["待处理举报", number(t.openReports)],
                ["管理员", number(t.admins)],
                ["公开主页", number(t.publicProfiles)],
                ["有效登录会话", number(t.validSessions)],
                ["通行密钥", number(t.passkeys)],
                ["后台操作记录", number(t.operations)],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardContent>
                  <p>{label}</p>
                  <strong>{value}</strong>
                </CardContent>
              </Card>
            ))}
          </div>
          <h2>业务分布</h2>
          <div className="statistics-grid">
            <Distribution title="书架状态" rows={data.distributions.library} />
            <Distribution title="分享状态" rows={data.distributions.shares} />
            <Distribution
              title="内容资格"
              rows={data.distributions.eligibility}
            />
            <Distribution title="版本引擎" rows={data.catalog?.engines} />
            <Distribution title="版本状态" rows={data.catalog?.versionStatus} />
            <Distribution
              title="页面分级"
              rows={data.catalog?.pageSuitability}
            />
          </div>
          <Panel
            title="阅读时长排行"
            description="累计记录的阅读时长前 10 部作品，不随趋势范围改变。"
          >
            {data.topWorks.length ? (
              <Table
                rowKeys={data.topWorks.map((w) => w.id)}
                headers={[
                  "作品",
                  "阅读时长（小时）",
                  "阅读启动",
                  "内部阅读计数",
                  "点赞",
                  "收藏",
                ]}
                rows={data.topWorks.map((w) => [
                  w.title,
                  (w.readingSeconds / 3600).toLocaleString("zh-CN", {
                    maximumFractionDigits: 1,
                  }),
                  number(w.readingStarts),
                  number(w.internalReads),
                  number(w.likes),
                  number(w.favorites),
                ])}
              />
            ) : (
              <p>暂无阅读记录</p>
            )}
          </Panel>
          <details className="statistics-definitions">
            <summary>统计口径</summary>
            <ul>
              <li>
                数据来自本站内部业务记录，不读取
                Umami。阅读启动不是独立用户；内部阅读计数使用已有的 30
                分钟去重规则，不等同于 PV 或 UV。
              </li>
              <li>
                阅读时长是已记录的累计秒数。近 15
                分钟阅读用户按活跃阅读会话去重；有效登录会话不是在线人数。
              </li>
              <li>
                存档容量是数据库登记的文件字节数；引用容量按账号与文件哈希去重，不代表磁盘或对象存储实际占用。历史版本包含仍保留的旧版本。
              </li>
              <li>
                未过期启用分享按分享状态统计，排除已过期、撤回与封禁记录，但目标版本下线、内容资格限制仍可能使分享无法访问；待审分享排除已过期记录。后台操作数量包含失败或结果待确认的审计请求。
              </li>
              <li>
                版本统计含隐藏与已删除版本；页面分级使用当前有效的审核结果，失效或未审核的内容计入待确认。
              </li>
            </ul>
          </details>
          <nav className="dashboard-shortcuts" aria-label="管理入口">
            {[
              ["catalog", "作品与版本"],
              ["shares", "分享审核"],
              ["users", "用户管理"],
              ["audit", "操作记录"],
            ].map(([id, label]) => (
              <Link key={id} to={"/dash/" + id}>
                {label}
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </nav>
        </>
      )}
    </main>
  );
}
