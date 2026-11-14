// 仅用于隔离预览：在同进程公开投影边界注入延迟，不触碰生产入口。
import { existsSync } from 'node:fs';
const key = Symbol.for('wg.public-share-projection');
let bridge;
Object.defineProperty(globalThis, key, {
  configurable: true,
  get: () => bridge,
  set(value) {
    bridge = { ...value, async fetch(request) {
      if (process.env.NAVIGATION_TEST_DELAY && existsSync(process.env.NAVIGATION_TEST_DELAY)) {
        await new Promise(resolve => setTimeout(resolve, 1400));
      }
      return value.fetch(request);
    } };
  },
});
