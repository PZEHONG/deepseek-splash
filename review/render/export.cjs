const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const profile = path.join(root, 'temp', 'export-profile');
const frames = path.join(root, 'temp', 'export-frames');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(frames, { recursive: true });
for (const key of ['userData', 'sessionData', 'appData', 'temp']) app.setPath(key, profile);
app.setAppLogsPath(path.join(profile, 'logs'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1920, height: 1080, useContentSize: true, frame: false, show: false, backgroundColor: '#05060e', webPreferences: { offscreen: true, backgroundThrottling: false, nodeIntegration: false, contextIsolation: true, sandbox: true } });
  await window.loadFile(path.join(root, 'package', 'harness-splash.html'));
  window.webContents.setZoomFactor(2);
  await window.webContents.executeJavaScript(`(async()=>{const last=setTimeout(()=>{},0);for(let i=0;i<=last;i++)clearTimeout(i);const v=document.querySelector('video');v.pause();if(v.readyState<2)await new Promise(r=>v.addEventListener('loadeddata',r,{once:true}));document.getAnimations().forEach(a=>a.pause());})()`);
  for (let i=0;i<96;i++) {
    const t=i/24;
    await window.webContents.executeJavaScript(`(async()=>{const v=document.querySelector('video');if(Math.abs(v.currentTime-${t})>.0001){await new Promise(r=>{v.addEventListener('seeked',r,{once:true});v.currentTime=${t};});}document.getAnimations().forEach(a=>{a.pause();a.currentTime=${t*1000};});document.querySelector('.progress').style.transition='none';document.querySelector('.progress').style.width='${t/4*100}%';document.body.style.transition='none';document.body.style.opacity='${t>3.75?(4-t)/.25:1}';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
    const capture=await window.webContents.capturePage();
    fs.writeFileSync(path.join(frames, String(i).padStart(3, '0')+'.jpg'), capture.toJPEG(91));
  }
  fs.writeFileSync(path.join(root,'review','render-result.json'), JSON.stringify({ok:true,frames:96,width:1920,height:1080,fps:24}));
  app.exit(0);
}).catch(error=>{fs.writeFileSync(path.join(root,'review','render-result.json'),JSON.stringify({ok:false,error:error.stack}));app.exit(1);});
