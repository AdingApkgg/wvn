import {analyticsPayload,canonicalAnalyticsPath} from './contract.ts';
type Tracker={track:(payload:unknown)=>unknown};
export class PublicTracker{
 private path:string|null=null;
 private queue:{path:string;payload:unknown}[]=[];
 constructor(private websiteId:string,private hostname:string,private tracker:()=>Tracker|undefined){}
 navigate(path:string){
  const next=canonicalAnalyticsPath(path);if(next===this.path)return;
  this.path=next;if(!next){this.queue=[];return}this.enqueue();
 }
 event(name:'reading_start'|'like'|'favorite',enabled?:boolean,expectedPath?:string){
  if(!this.path||expectedPath&&canonicalAnalyticsPath(expectedPath)!==this.path)return;
  this.enqueue(name,enabled);
 }
 private enqueue(name?:string,enabled?:boolean){
  if(!this.path)return;
  const value=analyticsPayload({type:'event',payload:{website:this.websiteId,url:this.path,...(name?{name,data:{enabled}}:{})}},this.websiteId,this.hostname);
  if(!value)return;this.queue.push({path:this.path,payload:value.payload});this.queue=this.queue.slice(-20);this.flush();
 }
 flush(){
  const tracker=this.tracker();if(!this.path){this.queue=[];return}if(!tracker)return;
  const pending=this.queue;this.queue=[];
  for(const event of pending)if(event.path===this.path)try{tracker.track(event.payload)}catch{}
 }
}
