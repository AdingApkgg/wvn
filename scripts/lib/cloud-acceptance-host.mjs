// 仅用于已登记远程验收环境；不能借环境变量回退到 Mac 或正式站点。
export function cloudAcceptanceHost(env, hostname, cwd) {
  const linux = hostname === 'localhost' && cwd === '/home/wvn/wvn-emscripten-20261025';
  const container = hostname === 'wvn-cloud-browser-qa' && cwd === '/work';
  if (!linux && !container) throw Error('Cloud acceptance requires the known remote build host or Arch QA container');
  const origin = env.WG_CLOUD_ORIGIN ?? 'https://localhost:18601';
  if (origin !== 'https://localhost:18601') throw Error('Only the isolated cloud preview origin is accepted');
  const concurrency = Number(env.WG_CLOUD_CONCURRENCY ?? (container ? 1 : 2));
  if (![1, 2].includes(concurrency) || (container && concurrency !== 1)) throw Error('Invalid cloud acceptance concurrency');
  return { origin, concurrency, proxy: container ? 'http://127.0.0.1:20172' : 'http://127.0.0.1:11090', certificate: container ? '/qa/preview.crt' : 'preview.crt', host: container ? 'arch/isolated-browser-container' : 'localhost-1', browserArgs: ['--host-resolver-rules=MAP localhost 192.0.2.10', '--disk-cache-size=1048576', '--media-cache-size=1048576', '--disable-gpu-shader-disk-cache'] };
}
