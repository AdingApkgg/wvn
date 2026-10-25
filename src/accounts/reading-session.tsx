import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useAccount } from "./client";
import { Button } from "../components/ui/button";

// 书架计时跟随顶层阅读器；账号状态不传入游戏沙箱。
export function ReadingSession({ running }: { running: boolean }) {
  const [query] = useSearchParams();
  const id = query.get("session");
  return id && /^[a-f0-9-]{36}$/.test(id) ? <Session key={id} id={id} running={running} /> : null;
}
function Session({ id, running }: { id: string; running: boolean }) {
  const account = useAccount();
  const owner = account.me?.user.id;
  const sequence = useRef(Date.now()), renewed = useRef(Date.now());
  const [idle, setIdle] = useState(false), [online, setOnline] = useState(true);
  useEffect(() => { if (running) { renewed.current = Date.now(); setIdle(false); } }, [running]);
  useEffect(() => {
    if (!owner) return;
    let live = true;
    const pulse = () => {
      const paused = Date.now() - renewed.current >= 300_000;
      setIdle(paused);
      void account.request(`/api/me/play-sessions/${id}/heartbeat`, {
        seq: ++sequence.current,
        active: running && !paused && document.visibilityState === "visible" && document.hasFocus(),
      }, undefined, owner).then(() => { if (live) setOnline(true); }).catch(() => { if (live) setOnline(false); });
    };
    pulse();
    const timer = setInterval(pulse, 30_000);
    document.addEventListener("visibilitychange", pulse);
    return () => {
      live = false; clearInterval(timer); document.removeEventListener("visibilitychange", pulse);
      void account.request(`/api/me/play-sessions/${id}/heartbeat`, { seq: ++sequence.current, active: false }, undefined, owner).catch(() => {});
    };
  }, [owner, id, running, account.request]);
  return <div className="reading-session text-xs text-muted-foreground" role="status">
    {!online ? "阅读计时连接中断，离线时长暂未计入；存档单独保留。" : !owner ? "登录后可继续记录阅读时间。" : !running ? "本次阅读记录已保留。" : idle ? "阅读计时已暂停。" : "正在估算前台阅读时长，每 5 分钟需确认继续。"}
    {running && idle && <Button size="sm" variant="ghost" onClick={() => { renewed.current = Date.now(); setIdle(false); }}>继续记录时间</Button>}
  </div>;
}
