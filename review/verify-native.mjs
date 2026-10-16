import fs from 'node:fs';
const profile='D:/dsh-latest-windows-x64/resources/harness-local-data/desktop';
const destination='D:/deepseek开屏/review';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let port;
for(let i=0;i<120;i++){
  try{port=Number(fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0]);if(port){const response=await fetch(`http://127.0.0.1:${port}/json/list`);if(response.ok)break;}}catch{port=undefined;}
  await delay(100);
}
if(!port)throw Error('Native debugging endpoint was not ready');
const getTargets=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
let splash;
for(let i=0;i<50;i++){
  splash=(await getTargets()).find(target=>target.url.includes('harness-splash.html'));
  if(splash)break;
  await delay(60);
}
if(process.env.HARNESS_SPLASH_DIAGNOSTIC_FILE){
  if(!splash)throw Error('The native 4K intro was not created');
  const videoSocket=new WebSocket(splash.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{videoSocket.addEventListener('open',resolve,{once:true});videoSocket.addEventListener('error',reject,{once:true});});
  let videoProbeId=0;
  const videoRequests=new Map();
  videoSocket.addEventListener('message',event=>{const message=JSON.parse(event.data);const request=videoRequests.get(message.id);if(request){videoRequests.delete(message.id);message.error?request.reject(Error(message.error.message)):request.resolve(message.result?.result?.value);}});
  const probeVideo=()=>new Promise((resolve,reject)=>{
    const id=++videoProbeId;videoRequests.set(id,{resolve,reject});
    videoSocket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression:`(()=>{const v=document.querySelector('video');if(!v)return null;const q=v.getVideoPlaybackQuality();return {width:v.videoWidth,height:v.videoHeight,time:v.currentTime,playing:!v.paused,muted:v.muted,totalFrames:q.totalVideoFrames,droppedFrames:q.droppedVideoFrames,fit:getComputedStyle(v).objectFit};})()`,returnByValue:true}}));
    setTimeout(()=>{if(videoRequests.delete(id))reject(Error('4K playback probe timed out'));},2000);
  });
  let video;
  for(let i=0;i<60;i++){video=await probeVideo();if(video?.width===3840&&video.height===2160&&video.time>0.2&&video.playing)break;await delay(50);}
  if(video?.width!==3840||video?.height!==2160||!video.playing||!video.muted||video.fit!=='cover')throw Error('Native 4K playback failed: '+JSON.stringify(video));
  await delay(1200);
  video=await probeVideo();
  videoSocket.close();
  fs.writeFileSync(destination+'/native-4k-playback.json',JSON.stringify(video,null,2));
  let timing;
  for(let i=0;i<240;i++){
    try{timing=JSON.parse(fs.readFileSync(process.env.HARNESS_SPLASH_DIAGNOSTIC_FILE,'utf8'));if(timing.events?.some(event=>event.name==='intro-closed'))break;}catch{}
    await delay(50);
  }
  const ready=timing?.events?.find(event=>event.name==='ui-ready');
  const shown=timing?.events?.find(event=>event.name==='application-shown');
  const closed=timing?.events?.find(event=>event.name==='intro-closed');
  const introShown=timing?.events?.find(event=>event.name==='intro-shown');
  if(!ready||!shown?.ready||closed?.reason!=='ready')throw Error('Native UI readiness handoff failed: '+JSON.stringify(timing));
  if(!introShown||introShown.fullscreen||introShown.maximized||introShown.contentBounds.width!==introShown.expectedBounds.width||introShown.contentBounds.height!==introShown.expectedBounds.height)throw Error('Native intro did not use its initial window size');
  if(shown.fullscreen||shown.maximized||Math.abs(shown.bounds.width-shown.initialBounds.width)>1||Math.abs(shown.bounds.height-shown.initialBounds.height)>1)throw Error('Native application did not retain its original window size');
  if(closed.elapsedMs-ready.elapsedMs>80)throw Error('Extra animation delay after UI readiness');
  const targets=await getTargets();
  if(targets.some(target=>target.url.includes('harness-splash.html')))throw Error('Video window remained open after UI readiness');
  const main=targets.find(target=>target.url.startsWith('dsh-app://app/'));
  if(!main)throw Error('Application page was not present');
  const ws=new WebSocket(main.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const ui=await new Promise((resolve,reject)=>{
    ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id===1)resolve(message.result?.result?.value);});
    ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`({visible:document.visibilityState==='visible',boot:!!document.querySelector('[data-dsh-boot]'),mounted:document.getElementById('root')?.childElementCount>0,fullscreen:document.documentElement.dataset.fullscreen==='true'})`,returnByValue:true}}));
    setTimeout(()=>reject(Error('UI state probe timed out')),3000);
  });
  ws.close();
  const summary={ok:ui.visible&&!ui.boot&&ui.mounted&&!ui.fullscreen&&!shown.maximized,startupMs:ready.elapsedMs,handoffMs:closed.elapsedMs-ready.elapsedMs,video,application:ui,splashClosed:true,timing};
  fs.writeFileSync(destination+'/native-result.json',JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
  if(!summary.ok)process.exitCode=1;
  process.exit(process.exitCode??0);
}
if(!splash)throw Error('Native splash page was not created');
const socket=new WebSocket(splash.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let id=0;const pending=new Map();
socket.addEventListener('message',event=>{const message=JSON.parse(event.data);const task=pending.get(message.id);if(task){pending.delete(message.id);message.error?task.reject(Error(message.error.message)):task.resolve(message.result);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const number=++id;pending.set(number,{resolve,reject});socket.send(JSON.stringify({id:number,method,params}));setTimeout(()=>{if(pending.delete(number))reject(Error('Timed out: '+method));},3000);});
await delay(1100);
const result=await call('Runtime.evaluate',{expression:`(()=>{const v=document.querySelector('video');return {url:location.href,time:v.currentTime,playing:!v.paused,width:v.videoWidth,muted:v.muted,title:document.querySelector('h1').textContent};})()`,returnByValue:true});
const state=result.result.value;
if(!(state.time>0&&state.playing&&state.width===3840&&state.muted))throw Error('Native 4K splash video did not play: '+JSON.stringify(state));
const capture=await call('Page.captureScreenshot',{format:'png'});
fs.writeFileSync(destination+'/native-splash.png',Buffer.from(capture.data,'base64'));
socket.close();
await delay(6500);
const final=await getTargets();
const splashClosed=!final.some(target=>target.url.includes('harness-splash.html'));
const workspace=final.some(target=>target.url.startsWith('dsh-app://app/')||target.url.includes('welcome.html'));
const summary={ok:splashClosed&&workspace,splash:state,splashClosed,applicationPageReady:workspace};
fs.writeFileSync(destination+'/native-result.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
if(!summary.ok)process.exitCode=1;
