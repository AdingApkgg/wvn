import {useEffect,useState} from 'react';
import {LoaderCircle,AlertCircle} from 'lucide-react';
import {Button} from '../components/ui/button';
import {formatTransferBytes,type TransferMetrics} from '../../public/ons/resource-loading.mjs';
import {loadingPercent,type LoadingProgress} from '../../public/ons/loading.mjs';

function TransferDetails({progress,active=true}:{progress:TransferMetrics;active?:boolean}){
 const [sampleAt,setSampleAt]=useState(Date.now()),[clock,setClock]=useState(Date.now());
 useEffect(()=>{const now=Date.now();setSampleAt(now);setClock(now)},[progress]);
 useEffect(()=>{if(!active||progress.bytesLoaded===undefined)return;const timer=setInterval(()=>setClock(Date.now()),500);return()=>clearInterval(timer)},[active,progress.bytesLoaded!==undefined]);
 const loaded=formatTransferBytes(progress.bytesLoaded),total=formatTransferBytes(progress.bytesTotal),speed=formatTransferBytes(progress.bytesPerSecond);
 const speedText=clock-sampleAt>1500?'等待数据':speed!==null?speed+'/s':loaded===null?'等待数据':'测速中';
 return <div className="reader-transfer-details" data-testid="reader-transfer-details" data-received={progress.bytesLoaded} data-total={progress.bytesTotal} data-speed={progress.bytesPerSecond}>
  <span>{loaded===null?'大小待获取':total?`${loaded} / ${total}`:`已接收 ${loaded} · 总量未知`}</span><span>{speedText}</span>
 </div>;
}

export function LoadingView({progress,startedAt,onCancel}:{progress:LoadingProgress;startedAt:number;onCancel:()=>void}){
 const [seconds,setSeconds]=useState(0);
 useEffect(()=>{const tick=()=>setSeconds(Math.max(0,Math.floor((Date.now()-startedAt)/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[startedAt]);
 const failed=progress.stage==='failed',percent=loadingPercent(progress);
 const title=progress.stage==='connecting'?'正在打开播放器':progress.stage==='downloading'?progress.kind==='engine'?'正在下载运行资源':progress.kind==='game'?'正在下载游戏资源':'正在下载资源':progress.stage==='restoring'?'正在恢复本机存档':failed?'加载未完成':'正在准备游戏';
 return <div className="reader-loading" data-testid="reader-loading" data-stage={progress.stage}>
  <div className="reader-loading-card">
   {failed?<AlertCircle className="reader-loading-icon" aria-hidden="true"/>:<LoaderCircle className="reader-loading-icon reader-loading-spinner" aria-hidden="true"/>}
   <p className="reader-loading-title" role={failed?'alert':'status'}>{title}</p>
   {failed?<p className="reader-loading-detail">{progress.message||'资源暂时无法载入，可以返回准备页后重试。'}</p>:<>
    <div className="reader-loading-track" role="progressbar" aria-label="当前资源加载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent??undefined} aria-valuetext={percent===null?'加载中，暂时无法取得总量':`当前资源 ${percent}%`}>
     <span className={percent===null?'reader-loading-indeterminate':''} style={percent===null?undefined:{width:percent+'%'}} />
    </div>
    <div className="reader-loading-metrics"><span>{percent===null?'准备完成后自动进入游戏':`当前资源 ${percent}%`}</span><span aria-hidden="true">已等待 {seconds<60?seconds+' 秒':Math.floor(seconds/60)+' 分 '+seconds%60+' 秒'}</span></div>
    {progress.stage==='downloading'&&<TransferDetails progress={progress}/>}
    <p className="reader-loading-detail">较大的作品可能需要几分钟，请保持页面打开。下载完成后还需准备游戏。</p>
   </>}
   <Button variant="outline" size="sm" onClick={onCancel}>{failed?'返回阅读准备':'取消加载'}</Button>
   <p className="reader-loading-preserved">本机存档和历史备份会继续保留</p>
  </div>
 </div>;
}

// 游玩中仅在画面边缘反馈，不接管输入或弹回启动遮罩。
export function ResourceLoadingBar({progress}:{progress:import('../../public/ons/resource-loading.mjs').ResourceProgress|null}){
 const [visible,setVisible]=useState(false),[failed,setFailed]=useState(false);
 const active=progress?.active??0;
 useEffect(()=>{if(!active){setVisible(false);return}const timer=setTimeout(()=>setVisible(true),180);return()=>clearTimeout(timer)},[active>0]);
 useEffect(()=>{if(!progress?.failed){setFailed(false);return}setFailed(true);const timer=setTimeout(()=>setFailed(false),8000);return()=>clearTimeout(timer)},[progress]);
 if(!visible&&!failed)return null;
 const percent=progress?.total&&progress.loaded!==undefined?Math.floor(progress.loaded/progress.total*100):null;
 return <div className="reader-resource-loading" data-testid="reader-resource-loading" data-active={active}>
  <div className="reader-resource-label" role={failed?'alert':'status'}>{failed?'部分资源加载失败，请检查网络':active>1?`正在加载资源 · ${active} 项`:'正在加载资源'}{!failed&&<span>{percent===null?'加载中':percent+'%'}</span>}</div>
  {visible&&<TransferDetails progress={progress??{}} active={active>0}/>}
  {visible&&<div className="reader-loading-track" role="progressbar" aria-label="游玩资源加载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent??undefined} aria-valuetext={percent===null?'正在加载资源':`当前资源 ${percent}%`}><span className={percent===null?'reader-loading-indeterminate':''} style={percent===null?undefined:{width:percent+'%'}}/></div>}
 </div>;
}
