import { forwardRef, useContext, useEffect, useRef } from "react";
import { preload, preloadModule } from "react-dom";
import {
  Link,
  matchRoutes,
  UNSAFE_DataRouterContext,
  UNSAFE_FrameworkContext,
  useHref,
  type LinkProps,
} from "react-router";

// 权限数据是 no-store，Cloudflare 原生 prefetch 不回源；只提前加载构建清单中的代码/样式。
// FrameworkContext 为当前锁定的 React Router 版本提供的资产清单，升级时由浏览器回归验证。
export const IntentLink = forwardRef<HTMLAnchorElement, Omit<LinkProps, "prefetch">>(function IntentLink(
  { onClick, onMouseEnter, onMouseLeave, onFocus, onBlur, onTouchStart, ...props },
  ref,
) {
  const framework = useContext(UNSAFE_FrameworkContext);
  const routing = useContext(UNSAFE_DataRouterContext);
  const href = useHref(props.to, { relative: props.relative });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  const prepare = () => {
    cancel();
    if (!framework || !routing || props.reloadDocument || props.download || props.target && props.target !== "_self") return;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return;
    const matches = matchRoutes(routing.router.routes, url.pathname, routing.basename);
    for (const match of matches ?? []) {
      const route = framework.manifest.routes[match.route.id!];
      if (!route) continue;
      for (const module of [route.module, ...(route.imports ?? [])]) preloadModule(module, { as: "script" });
      for (const css of route.css ?? []) preload(css, { as: "style" });
    }
  };
  return <Link {...props} ref={ref} prefetch="none"
    onClick={event => {
      onClick?.(event);
      // 快速点击可能早于 hover 延迟；并行请求依赖，避免主模块下载后才发现它们。
      if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) prepare();
    }}
    onMouseEnter={event => { onMouseEnter?.(event); if (!event.defaultPrevented) { cancel(); timer.current = setTimeout(prepare, 100); } }}
    onMouseLeave={event => { onMouseLeave?.(event); cancel(); }}
    onFocus={event => { onFocus?.(event); if (!event.defaultPrevented) prepare(); }}
    onBlur={event => { onBlur?.(event); cancel(); }}
    onTouchStart={event => { onTouchStart?.(event); if (!event.defaultPrevented) prepare(); }} />;
});
