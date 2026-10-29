import type{Hono}from'hono';import{resolve}from'node:path';import{existsSync}from'node:fs';import{fileResponse}from'../server/resources.ts';
const registered=new WeakSet<Hono>();
export function registerPlayerModules(app:Hono){
 if(registered.has(app))return;registered.add(app);
 const root=resolve(existsSync('build/client/player')?'build/client/player':'public/player');
 app.on(['GET','HEAD'],'/player/:file',async c=>{
    if(!['runtime.mjs','adapters.mjs','registry.mjs','legacy-context.mjs','emscripten.mjs','native-input.mjs','renpy-audio.mjs','resource-location.mjs','resource-download.mjs','room-client.mjs'].includes(c.req.param('file')))return c.notFound();
  const response=await fileResponse(c.req.raw,root,'/'+c.req.param('file'));
  response.headers.set('Access-Control-Allow-Origin','*');response.headers.set('Cross-Origin-Resource-Policy','cross-origin');response.headers.set('Cache-Control','no-store');return response;
 });
}
