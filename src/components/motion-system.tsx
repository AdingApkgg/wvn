import { useLayoutEffect, type ReactNode } from "react";
import { MotionConfig, useAnimate, useReducedMotion } from "motion/react";
import { useLocation } from "react-router";
import { m3Motion } from "../lib/m3-motion";

export function MotionSystem({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={m3Motion.spatial.default}>{children}</MotionConfig>;
}

// 不以路由 key 卸载内容；游戏、表单草稿与账号提供者保持原有生命周期。
export function RouteMotion({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduced = useReducedMotion();
  const reader = /^\/(?:\d+|b\d+)\/\d+\/?$/.test(pathname);
  useLayoutEffect(() => {
    const element = scope.current;
    if (reader || reduced) {
      element.style.transform = "none";
      return;
    }
    // MotionValue 的 set 会排到下一帧；直接写入起点，避免新内容先原位显示再下跳。
    element.style.transform = "translateY(8px)";
    const animation = animate(element, { transform: ["translateY(8px)", "translateY(0px)"] }, m3Motion.spatial.default);
    return () => animation.stop();
  }, [pathname, reader, reduced, scope, animate]);
  return <div ref={scope} className="route-motion">{children}</div>;
}
