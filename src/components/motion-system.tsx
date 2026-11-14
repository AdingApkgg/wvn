import { useEffect, type ReactNode } from "react";
import { MotionConfig, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useLocation } from "react-router";
import { m3Motion } from "../lib/m3-motion";

export function MotionSystem({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={m3Motion.spatial.default}>{children}</MotionConfig>;
}

// 不以路由 key 卸载内容；游戏、表单草稿与账号提供者保持原有生命周期。
export function RouteMotion({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const controls = useAnimationControls();
  const reduced = useReducedMotion();
  const reader = /^\/(?:\d+|b\d+)\/\d+\/?$/.test(pathname);
  useEffect(() => {
    if (reader || reduced) {
      controls.set({ opacity: 1, y: 0 });
      return;
    }
    controls.set({ opacity: 1, y: 8 });
    void controls.start({ y: 0, transition: m3Motion.spatial.default });
    return () => controls.stop();
  }, [pathname, reader, reduced, controls]);
  return <motion.div className="route-motion" initial={false} animate={controls}
    transformTemplate={reader || reduced ? () => "none" : undefined}>{children}</motion.div>;
}
