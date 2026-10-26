/* WG bridge for the pinned ONScripterYuri build. No account credentials live here. */
/* Upstream engine: https://github.com/YuriSizuku/OnscripterYuri (GPL-2.0). */
var g_onsyuri_module = {}, g_onsyuri_index = {}, g_onsyuri_filemap = {};
var g_screen_width = 800, g_screen_height = 600;
function scale_full(canvas, ratio) {
  ratio = ratio > 0 ? ratio : 4 / 3;
  const w = innerWidth, h = innerHeight;
  canvas.style.width = Math.min(w, h * ratio) + "px";
  canvas.style.height = Math.min(h, w / ratio) + "px";
}
async function fetch_file(FS, path, filemap) {
  const node = filemap[path.toLowerCase()];
  if (!node) return 0;
  if (node.loaded) return 1;
  try {
    const r = await fetch(node.url, { credentials: "omit" });
    if (!r.ok) throw Error("资源读取失败 " + r.status);
    FS.writeFile(path, new Uint8Array(await r.arrayBuffer())); node.loaded = true; return 1;
  } catch (e) { console.error("WG ONS resource", path, e); return -1; }
}
let captureSave = () => {};
function flush_save() { queueMicrotask(() => captureSave()); }
addEventListener("resize", () => scale_full(document.getElementById("canvas"), g_screen_width / g_screen_height));
(function () {
  const origin = new URL(location.href).origin;
  const pilot = location.pathname.split("/").pop();
  let initialized = false;
  async function initialize(event) {
    const init = event.data;
    if (initialized || event.source !== parent || event.origin !== origin || init?.type !== "WG_ONS_INIT" || init.pilot !== pilot || !/^[a-f0-9-]{36}$/.test(init.nonce) || event.ports.length !== 1) return;
    initialized = true; removeEventListener("message", initialize);
    const port = event.ports[0], nonce = init.nonce;
    let seq = 0, pending = null, queued = null, failed = false, started = false;
    const send = message => port.postMessage({ ...message, pilot, nonce });
    const status = message => { document.getElementById("status").textContent = message; send({ type: "status", message }); };
    let validateSnapshot, limits, createEmscriptenDriver, captureFilesystem, createLoadingReporter, observeStartupRequests;
    try { ({ validateSnapshot, limits } = await import(origin + "/ons/protocol.mjs")); ({ createEmscriptenDriver, captureFilesystem } = await import(origin + "/player/emscripten.mjs")); ({createLoadingReporter,observeStartupRequests}=await import(origin+"/ons/loading.mjs")); }
    catch (e) { send({type:"loading-progress",stage:"failed",message:"播放器组件暂时不可用，请取消后重试"});status("启动失败：存档桥接模块不可用"); return; }
    const loading=createLoadingReporter(send);let stopObserving=()=>{};loading.phase("connecting");
    stopObserving=observeStartupRequests(window,loading,resource=>{const url=new URL(typeof resource==="string"?resource:resource?.url??resource?.href??"",location.href);if(url.origin!==origin)return null;if(url.pathname.startsWith("/__ons/engine/")||url.pathname.startsWith("/__engines/resource/"))return "engine";return url.pathname.startsWith("/__ons/data/"+pilot+"/")?"game":null;});
    function snapshot() {
      const files = captureFilesystem(g_onsyuri_module.FS, [{path:"/save",prefix:""}], limits);
      return validateSnapshot({ schema: 1, pilot, files }, pilot);
    }
    captureSave = requestId => {
      if (!started || (failed && !requestId)) return;
      if (pending) { if (requestId) queued = requestId; return; }
      try {
        const value = snapshot(); pending = ++seq;
        send({ type: "snapshot", seq, requestId: typeof requestId === "string" ? requestId : undefined, snapshot: value });
      } catch (e) { status("保存失败：" + e.message); }
    };
    port.onmessage = ({ data }) => {
      if (!data || data.nonce !== nonce || data.pilot !== pilot) return;
      if (data.type === "ack" && data.seq === pending) {
        pending = null; failed = !data.ok;
        if (!data.ok) status("本机保存失败，请从 WVN 工具栏导出当前存档");
        if (queued) { const id = queued; queued = null; captureSave(id); }
      } else if (data.type === "snapshot" && /^[a-f0-9-]{36}$/.test(data.requestId)) captureSave(data.requestId);
      else if (data.type === "menu" && started) {
        const canvas = document.getElementById("canvas"); canvas.focus();
        const key = down => canvas.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { bubbles: true, cancelable: true, key: "Escape", code: "Escape", keyCode: 27, which: 27 }));
        key(true); setTimeout(() => key(false), 60);
      }
    };
    try {
      const restored = validateSnapshot(init.snapshot, pilot);
      loading.phase("downloading","engine");status("正在载入共享引擎…");
      const r = await fetch(`/__ons/manifest/${pilot}`, { credentials: "omit" });
      if (!r.ok) throw Error("资源清单不可用");
      g_onsyuri_index = await r.json();
      if (g_onsyuri_index.pilot !== pilot || g_onsyuri_index.savedir !== "/save") throw Error("资源版本不匹配");
      const release=g_onsyuri_index.engineRelease;
      if(release&&(!/^ons-[a-f0-9]{64}$/.test(release.id)||!Array.isArray(release.files)))throw Error("候选引擎登记无效");
      const engine = origin + (release?"/__engines/resource/"+release.id+"/":"/__ons/engine/" + g_onsyuri_index.engine + "/");
      const scriptHash=release?.files.find(file=>file.path==="onsyuri.js")?.sha256;
      if(release&&!/^[a-f0-9]{64}$/.test(scriptHash))throw Error("候选引擎脚本指纹缺失");
      const wasm = await fetch(engine + "onsyuri.wasm", { credentials: "omit" });
      if (!wasm.ok) throw Error("共享引擎校验失败");
      await new Promise((resolve, reject) => {
        const script = document.createElement("script"); script.src = engine + "onsyuri.js";
        script.crossOrigin = "anonymous"; script.integrity = scriptHash?"sha256-"+btoa(String.fromCharCode(...scriptHash.match(/../g).map(byte=>parseInt(byte,16)))):"sha256-M07jIknc5sjWzffgxraOcEEpxY76lJM2yPrRR0KogsE=";
        script.onload = resolve; script.onerror = () => reject(Error("引擎脚本加载或完整性校验失败")); document.head.append(script);
      });
      function mkdir(FS, path) { if (path) FS.mkdirTree(path); }
      g_onsyuri_module = {
        canvas: document.getElementById("canvas"), noInitialRun: true,
        wasmBinary: new Uint8Array(await wasm.arrayBuffer()), locateFile: path => engine + path,
        print: line => console.log("ONS", line), printErr: line => console.warn("ONS", line),
        onAbort: () => status("引擎停止；本机历史备份仍保留"),
        preRun() {
          const FS = g_onsyuri_module.FS;
          mkdir(FS, "/game"); mkdir(FS, "/save");
          // ONS keeps envdata beside the script even with --save-dir. Redirect
          // this one settings file inside volatile MEMFS so the parent retains it.
          const restoredSettings = restored.files.find(file => file.path.toLowerCase() === "envdata");
          const settingsPath = "/save/" + (restoredSettings?.path ?? "envdata");
          FS.symlink(settingsPath, "/game/envdata");
          if (!g_onsyuri_index.files.some(file => file.path.toLowerCase() === "envdata") && !restoredSettings) FS.writeFile(settingsPath, new Uint8Array());
          for (const f of g_onsyuri_index.files) {
            if (f.path.toLowerCase() === "envdata") {
              if (!restoredSettings) FS.createPreloadedFile("/save", "envdata", origin + f.url, true, true);
              continue;
            }
            const absolute = "/game/" + f.path, slash = absolute.lastIndexOf("/");
            const dir = absolute.slice(0, slash), name = absolute.slice(slash + 1); mkdir(FS, dir);
            const url = origin + f.url;
            if (f.lazyload) g_onsyuri_filemap[absolute.toLowerCase()] = { url, loaded: false };
            else FS.createPreloadedFile(dir, name, url, true, false);
          }
          loading.phase("restoring");
          for (const f of restored.files) {
            const absolute = "/save/" + f.path; mkdir(FS, absolute.slice(0, absolute.lastIndexOf("/"))); FS.writeFile(absolute, f.data);
            if (f.mtime !== undefined) FS.utime(absolute, f.mtime, f.mtime);
          }
        },
      };
      const driver = createEmscriptenDriver({kind:"ONS",progress:event=>loading.engine(event),status:state=>{if(state==="failed")loading.fail("引擎加载失败，请取消后重试");else if(["initializing","initialized"].includes(state))loading.phase("initializing");}});
      g_onsyuri_module = await driver.startFactory(onsyuri, g_onsyuri_module);
      started = true;
      g_onsyuri_module.callMain(["--root", "/game", "--font", "/game/default.ttf", "--save-dir", "/save"]);
      driver.running();
      scale_full(g_onsyuri_module.canvas, g_screen_width / g_screen_height);
      g_onsyuri_module.canvas.focus();loading.complete();stopObserving();send({type:'started'}); status("引擎已启动");
      setInterval(() => captureSave(), 5000);
    } catch (e) { loading.fail(e.message);stopObserving();status("启动失败：" + e.message); }
  }
  addEventListener("message", initialize);
})();
