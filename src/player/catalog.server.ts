import type {Hono} from 'hono';
import type {Store} from '../server/store.ts';
import {parseWorkSlug,workSlug} from '../identity.ts';

export function registerTrustedCatalog(app:Hono,store:Store,render:(req:Request)=>Promise<Response>){
  app.get('/api/catalog',async c=>c.json((await store.list()).filter(w=>w.versions.length)));
  app.get('/api/works/:id',async c=>{const id=parseWorkSlug(c.req.param('id')),work=id?(await store.get(id)):null;return work?.versions.length?c.json(work):c.notFound()});
  app.on(['GET','HEAD'],'*',async c=>{
    let path:string;try{path=decodeURIComponent(new URL(c.req.url).pathname)}catch{return c.notFound()}
    const versions=(await Promise.all((await store.list()).flatMap(w=>w.versions).map(async v=>(await store.raw(v.id))!))).sort((a,b)=>b.legacyPath.length-a.legacyPath.length);
    const legacy=versions.find(v=>path===v.legacyPath.slice(0,-1)||path.startsWith(v.legacyPath));
    if(legacy){
      if([legacy.legacyPath.slice(0,-1),legacy.legacyPath,legacy.legacyPath+'index.html',legacy.legacyPath+'onsyuri.html'].includes(path))return c.redirect(`/${workSlug(legacy.workId)}/${legacy.number}/`,302);
      return c.notFound();
    }
    if(['/','/_root.data','/_.data'].includes(path))return render(c.req.raw);
    // Explicit work/version routes only. Never delegate arbitrary HTML, script,
    // management or filesystem paths to a legacy resource server.
    // Trailing-slash navigation uses /_.data; non-trailing routes use .data.
    const match=/^\/(b?[1-9]\d{0,8})(?:\/([1-9]\d{0,8}))?(?:\/|\/?\.data|\/_\.data)?$/.exec(path);
    if(!match)return c.notFound();
    const id=parseWorkSlug(match[1]),work=id?(await store.get(id)):null;
    if(!work?.versions.length||match[2]&&!work.versions.some(v=>String(v.number)===match[2]))return c.notFound();
    return render(c.req.raw);
  });
}
