// SSR can read the same service's public projection without sending a request
// through the public tunnel or forwarding player credentials.
const key=Symbol.for('wg.public-share-projection');
type Bridge={origin:string;fetch:(request:Request)=>Response|Promise<Response>};
const state=globalThis as typeof globalThis&{[name:symbol]:Bridge|undefined};
export function configurePublicProjection(origin:string,fetch:Bridge['fetch']){state[key]={origin,fetch}}
export function publicProjectionFetch():typeof fetch|undefined{
  const bridge=state[key];if(!bridge)return;
  return async(input,init)=>{
    const request=new Request(input,init),url=new URL(request.url);
    if(url.origin!==bridge.origin||request.method!=='GET'||!url.pathname.startsWith('/api/public/'))return new Response(null,{status:404});
    return bridge.fetch(new Request(request.url,{headers:{accept:'application/json'},signal:request.signal}));
  };
}
