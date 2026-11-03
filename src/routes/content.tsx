import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { brand } from "../brand";
import { AccountClientError } from "../accounts/client";
import { contentErrorCopy, useContentAccess } from "../content/client";
import { safeReturnPath } from "../content/policy";
import type { QuizAttempt, QuizResult } from "../content/types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "../components/ui/alert-dialog";

export function meta() {
  return [
    { title: `浏览规则与显示设置 · ${brand.shortName}` },
    { name: "description", content: "了解本站内容浏览规则，管理当前会话的显示设置。" },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

function dateTime(time: number) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(time);
}

export default function Content() {
  return <ContentSettings />;
}

export function ContentSettings({ returnTo: suppliedReturnTo, embedded = false }: { returnTo?: string; embedded?: boolean }) {
  const content = useContentAccess();
  const { access, enabled, account, loading } = content;
  const [search] = useSearchParams();
  const returnTo = safeReturnPath(suppliedReturnTo ?? search.get("returnTo"));
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false), [supported, setSupported] = useState(false);
  const [nickname, setNickname] = useState("");
  const [now, setNow] = useState(Date.now);
  const task = useRef(0), busyRef = useRef(false), heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setSupported(typeof PublicKeyCredential !== "undefined");
    const clear = () => {
      task.current++;
      busyRef.current = false;
      setBusy(false);
      setAttempt(null);
      setAnswers({});
      setResult(null);
      setError("");
      setConfirm(false);
    };
    window.addEventListener("wg-account-invalidated", clear);
    return () => { task.current++; window.removeEventListener("wg-account-invalidated", clear); };
  }, []);

  useEffect(() => {
    if (access.nextAttemptAt === null) return;
    const timer = window.setTimeout(() => { setNow(Date.now()); void content.refresh(); }, Math.max(0, access.nextAttemptAt - Date.now()) + 50);
    return () => window.clearTimeout(timer);
  }, [access.nextAttemptAt, content.refresh]);

  async function run(action: (check: () => boolean) => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    const start = task.current;
    const check = () => start === task.current;
    setBusy(true);
    setError("");
    try { await action(check); }
    catch (failure) {
      if (!check()) return;
      setError(contentErrorCopy(failure));
      if (failure instanceof AccountClientError && ["CONTENT_ATTEMPT_EXPIRED", "CONTENT_POLICY_CHANGED", "CONTENT_ATTEMPT_NOT_FOUND"].includes(failure.code)) {
        setAttempt(null);
        setAnswers({});
      }
      await content.refresh();
    } finally {
      if (check()) { busyRef.current = false; setBusy(false); }
    }
  }

  function start() {
    void run(async check => {
      const next = await content.request<QuizAttempt>("/api/me/content/attempts", {});
      if (!check()) return;
      setAttempt(next);
      setAnswers({});
      setResult(null);
      setNow(Date.now());
      requestAnimationFrame(() => heading.current?.focus());
    });
  }

  function submit() {
    if (!attempt) return;
    if (attempt.questions.some(question => !answers[question.id])) {
      setError("请完成全部 8 道题目，再提交答案。");
      return;
    }
    void run(async check => {
      const next = await content.request<QuizResult>(`/api/me/content/attempts/${encodeURIComponent(attempt.id)}/submit`, { answers });
      if (!check()) return;
      setResult(next);
      setAnswers({});
      setNow(Date.now());
      if (next.passed) setAttempt(null);
      requestAnimationFrame(() => heading.current?.focus());
    });
  }

  const retryLater = access.nextAttemptAt !== null && access.nextAttemptAt > now;
  const qualified = access.authenticated && access.eligibility === "qualified";
  const canTest = access.authenticated && ["unqualified", "needs_retest"].includes(access.eligibility);
  const errors = error || content.error || account?.error || "";

  const Surface = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";
  return <Surface className={embedded ? "content-page content-embedded" : "container content-page"}>
    <header className="content-heading">
      <p className="eyebrow">浏览规则与显示设置</p>
      <Heading>敏感内容浏览资格测试</Heading>
      <p>只确认对本站规则的理解。是否显示敏感内容，由你在每次登录后主动选择。</p>
    </header>

    <div className="content-columns">
      <section className="content-rules" aria-labelledby="content-rules-heading">
        <h2 id="content-rules-heading">先了解本站规则</h2>
        <ol>
          <li><strong>分别查看页面与版本。</strong>页面标为 SFW 不代表所有游玩版本都不含成人性内容；启动前查看具体版本标记。“内容待核实”按受限版本处理。</li>
          <li><strong>尊重现实中的同意与边界。</strong>游戏中的虚构描写不等于现实行为的许可。</li>
          <li><strong>公共发布仍有边界。</strong>取得浏览资格也不能将敏感画面直接放到公共区域；分享链接不会转移资格。</li>
          <li><strong>随时可以停止。</strong>内容引发不适时可退出、屏蔽或举报，无需完成阅读；标记不符可反馈，避免在公共区域传播敏感画面。</li>
          <li><strong>尊重每个人的显示选择。</strong>不出借账号，不替他人开启，不向对方发送未经同意的敏感内容。剧透与敏感内容分别判断。</li>
          <li><strong>资格与显示分别保存。</strong>资格属于账号，新登录会话默认公共浏览。切回公共浏览不会删除收藏、私人备份或本机阅读记录。</li>
        </ol>
        <div className="content-test-notes">
          <h3>测试如何进行</h3>
          <p>题库共 12 题，每次 8 题，全部答对即可通过。提交前可以修改答案，不按作答速度判定。</p>
          <p>每账号滚动 24 小时内最多提交 3 次；未通过后冷却 30 分钟，并提供错题规则解释。网络或会话错误不占失败次数。</p>
          <p>领取的题目 24 小时内有效；过期或规则更新只需重新领取，不计为失败。测试不询问个人经历。</p>
        </div>
      </section>

      <section className="content-status" aria-label="当前浏览设置">
        {!enabled ? <><h2>浏览设置暂未开放</h2><p>你可以继续浏览公开目录。</p></> :
          !access.authenticated ? <>
            <h2>先登录账号</h2>
            <p>资格保存在自己的账号中，登录后可以开始测试。</p>
            {account?.loading && <p role="status">正在确认账号状态…</p>}
            <Button disabled={busy || account?.loading || !supported || !account?.options?.passkey}
              onClick={() => void run(async () => { await account?.passkey("login"); await content.refresh(); })}>
              <Fingerprint aria-hidden="true" />使用通行密钥登录
            </Button>
            {supported && account?.options && !account.options.passkey && <p>当前环境暂不支持通行密钥登录。</p>}
            {!supported && !account?.loading && <p>此浏览器不支持通行密钥，请使用支持通行密钥的浏览器。</p>}
            <details className="content-signup"><summary>还没有账号？</summary>
              <form onSubmit={event => { event.preventDefault(); void run(async () => { await account?.passkey("signup", nickname); await content.refresh(); }); }}>
                <Label htmlFor="content-nickname">昵称</Label>
                <Input id="content-nickname" autoComplete="nickname" maxLength={40} required value={nickname} onChange={event => setNickname(event.target.value)} />
                <Button type="submit" variant="outline" disabled={busy || account?.loading || !supported || !account?.options?.passkey}>创建通行密钥并注册</Button>
              </form>
            </details>
          </> : qualified ? <>
            <ShieldCheck size={25} aria-hidden="true" />
            <h2 ref={heading} tabIndex={-1}>已取得浏览资格</h2>
            {access.canViewRestricted ? <>
              <p>当前会话已开启 NSFW 显示。作品与版本会保留文字标记，安全封面和剧透设置仍分别处理。</p>
              <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await content.setMode("public"); })}>切回公共浏览</Button>
            </> : <>
              <p>当前使用公共浏览。开启后，当前设备的这个登录会话将展示已审核的敏感内容。</p>
              <Button disabled={busy || loading || content.pendingPublic} onClick={() => setConfirm(true)}>开启 NSFW 显示</Button>
            </>}
            {content.pendingPublic && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await content.setMode("public"); })}>重试同步公共浏览</Button>}
            <p className="content-secondary">刷新页面可保持当前会话的设置；退出、换设备或重新登录后需再次主动开启。</p>
          </> : access.eligibility === "suspended" ? <>
            <h2>当前资格已暂停</h2><p>暂时无法通过重测恢复。你仍可公共浏览，并导出、恢复或删除自己的私人备份。</p>
            {embedded ? <p>可使用播放器中的保存与退出操作，保留本机副本。</p> : <Button asChild variant="outline"><Link to="/account?tab=saves">管理私人备份</Link></Button>}
          </> : canTest ? <>
            <h2>{access.eligibility === "needs_retest" ? "规则已更新，请重新测试" : "准备好后开始"}</h2>
            <p>通过后仍保持公共浏览，只有你确认开启后才改变显示范围。</p>
            <p>滚动 24 小时内剩余 {access.attemptsRemaining} 次提交机会。</p>
            {access.nextAttemptAt !== null && <p className="content-retry" role="status">可重试时间：<time dateTime={new Date(access.nextAttemptAt).toISOString()}>{dateTime(access.nextAttemptAt)}</time>（本机时间）</p>}
            {(!attempt || result) && <Button disabled={busy || loading || account?.loading || retryLater || access.attemptsRemaining <= 0} onClick={start}>开始规则测试</Button>}
          </> : null}
        {errors && (!attempt || result || !canTest) && <p className="content-error" role="alert">{errors}</p>}
        {!embedded && <div className="content-return"><Link to={returnTo}>返回原页面</Link><Link to="/account?tab=saves">账号与私人备份</Link></div>}
      </section>
    </div>

    {result && !result.passed && <section className="content-feedback" aria-live="polite">
      <h2 ref={heading} tabIndex={-1}>本次尚未通过</h2>
      <p>可以先回顾下列规则，冷却结束后再次尝试。</p>
      <ul>{result.incorrect.map(item => <li key={item.questionId}>
        <h3>{attempt?.questions.find(question => question.id === item.questionId)?.text ?? "规则解释"}</h3>
        <p><strong>规则解释：</strong>{item.explanation}</p>
      </li>)}</ul>
    </section>}

    {attempt && !result && canTest && <form className="content-quiz" onSubmit={event => { event.preventDefault(); submit(); }}>
      <header><h2 ref={heading} tabIndex={-1}>规则测试 · 共 8 题</h2>
        <p>请选择每题最符合本站规则的选项。全部完成后再提交，提交前可自由修改。</p>
        <p className="content-secondary">本份题目有效至 <time dateTime={new Date(attempt.expiresAt).toISOString()}>{dateTime(attempt.expiresAt)}</time>（本机时间），过期可重新领取。</p>
      </header>
      {attempt.questions.map((question, index) => <fieldset className="content-question" key={question.id} disabled={busy}>
        <legend><span>{index + 1}.</span> {question.text}</legend>
        {question.choices.map(choice => <label className="content-choice" key={choice.id}>
          <input type="radio" name={question.id} value={choice.id} required checked={answers[question.id] === choice.id}
            onChange={() => setAnswers(previous => ({ ...previous, [question.id]: choice.id }))} />
          <span>{choice.text}</span>
        </label>)}
      </fieldset>)}
      <div className="content-actions"><Button type="submit" disabled={busy}>提交答案</Button><p role="status">已作答 {Object.keys(answers).length} / 8 题</p></div>
      {errors && <p className="content-error" role="alert">{errors}</p>}
    </form>}

    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>开启当前会话的 NSFW 显示？</AlertDialogTitle>
        <AlertDialogDescription>开启后，当前设备的这个登录会话将展示已审核的敏感内容。请确认周围环境合适；你可随时切回公共浏览。</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction disabled={busy} onClick={() => void run(async () => { await content.setMode("restricted"); })}>确认开启</AlertDialogAction>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </Surface>;
}
