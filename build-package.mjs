import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const original='D:/dsh-latest-windows-x64/resources/app.asar';
const previousManifest=JSON.parse(fs.readFileSync(path.join(root,'delivery','manifest.json'),'utf8'));
const currentInstalled=fs.readFileSync(original);
const currentInstalledHash=crypto.createHash('sha256').update(currentInstalled).digest('hex');
assert([previousManifest.originalSha256,previousManifest.patchedSha256,previousManifest.previousPatchedSha256].includes(currentInstalledHash),'The installed application changed outside this patch');
const bytes=fs.readFileSync(path.join(root,'backup','app.original.asar'));
const originalBase=8+bytes.readUInt32LE(4);
const originalTree=JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(12)).toString());
const tree=structuredClone(originalTree);
const lookup=(tree,name)=>name.split('/').reduce((node,key)=>node.files[key],tree);
const content=(name)=>{const entry=lookup(originalTree,name);return bytes.subarray(originalBase+Number(entry.offset),originalBase+Number(entry.offset)+entry.size);};
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
assert.equal(sha(bytes),previousManifest.originalSha256);
const previousBackup=path.join(root,'backup','app.splash-'+currentInstalledHash.slice(0,12)+'.asar');
if(!fs.existsSync(previousBackup))fs.writeFileSync(previousBackup,currentInstalled);
let main=content('lib/main.js').toString();
assert(!main.includes('harness-splash.mjs'),'An intro patch is already installed');
const importAnchor='//#region ../../packages/util/home-paths/lib/index.js';
assert.equal(main.split(importAnchor).length,2);
const storageCode=`import { createHarnessSplash } from "./harness-splash.mjs";
let harnessIntro;
// All new desktop files live beside the D-drive application, including Chromium caches.
const harnessLocalData = join(process.resourcesPath, "harness-local-data");
for (const folder of ["desktop", "application-data", "temp", "logs", "crash-dumps"]) mkdirSync(join(harnessLocalData, folder), { recursive: true });
app.setPath("appData", join(harnessLocalData, "application-data"));
app.setPath("userData", join(harnessLocalData, "desktop"));
app.setPath("sessionData", join(harnessLocalData, "desktop"));
app.setPath("temp", join(harnessLocalData, "temp"));
app.setPath("crashDumps", join(harnessLocalData, "crash-dumps"));
process.env.TEMP = process.env.TMP = join(harnessLocalData, "temp");
process.env.DSH_HOME ??= "D:/deepseekharness/.dsh";
`;
main=main.replace(importAnchor,storageCode+importAnchor);
assert.equal(main.split('app.setAppLogsPath();').length,2);
main=main.replace('app.setAppLogsPath();','app.setAppLogsPath(join(harnessLocalData, "logs"));');
const bootAnchor='})) app.whenReady().then(main).catch(async (error) => {';
assert.equal(main.split(bootAnchor).length,2);
main=main.replace(bootAnchor,`})) app.whenReady().then(async () => {
  const introEvents = [];
  harnessIntro = createHarnessSplash({ BrowserWindow, onEvent(event) {
    introEvents.push(event);
    const output = process.env.HARNESS_SPLASH_DIAGNOSTIC_FILE;
    if (output && /^D:[\\\\/]/i.test(output)) {
      writeFileSync(output, JSON.stringify({ events: introEvents }, null, 2));
    }
  } });
  app.once("before-quit", () => harnessIntro.close("quit"));
  try { await main(); }
  catch (error) { harnessIntro.close("startup-failed"); throw error; }
}).catch(async (error) => {`);
const mainWindowAnchor='\t\tmainWindow = window;';
assert.equal(main.split(mainWindowAnchor).length,2);
main=main.replace(mainWindowAnchor,mainWindowAnchor+'\n\t\tharnessIntro?.hold(window);');
const welcomeAnchor='const window = new BrowserWindow(welcomeWindowOptions(process.platform, locale));';
assert.equal(main.split(welcomeAnchor).length,2);
main=main.replace(welcomeAnchor,welcomeAnchor+'\n\tharnessIntro?.hold(window, { documentReady: true });');
const fatalAnchor='function reportFatal(error, source) {';
assert.equal(main.split(fatalAnchor).length,2);
main=main.replace(fatalAnchor,fatalAnchor+'\n\tharnessIntro?.close("startup-failed");');
const readyHandler=`ipcMain.on("harness-splash:ui-ready", (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame || !event.senderFrame.url.startsWith("dsh-app://app/")) return;
    harnessIntro?.workspaceReady(mainWindow);
  });
  ipcMain.on("harness-splash:ui-failed", (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame || !event.senderFrame.url.startsWith("dsh-app://app/")) return;
    harnessIntro?.close("ui-failed");
  });
  `;
const ipcAnchor='ipcMain.handle(DESKTOP_IPC.boot, async (event) => {';
assert.equal(main.split(ipcAnchor).length,2);
main=main.replace(ipcAnchor,readyHandler+ipcAnchor);
const preload=content('lib/preload-app.cjs').toString()+`
// Notify the shell only after the application's own boot page has been replaced.
if (location.protocol === "dsh-app:" && location.hostname === "app") {
  const observeHarnessMount = () => {
    let notified = false;
    const observer = new MutationObserver(check);
    function check() {
      if (notified) return;
      const root = document.getElementById("root");
      const boot = root?.querySelector("[data-dsh-boot]");
      if (boot && !boot.querySelector("[data-dsh-boot-spinner]")) {
        notified = true; observer.disconnect();
        electron.ipcRenderer.send("harness-splash:ui-failed");
      } else if (root && root.childElementCount > 0 && !boot) {
        notified = true; observer.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => electron.ipcRenderer.send("harness-splash:ui-ready")));
      }
    }
    observer.observe(document.documentElement, { childList: true, subtree: true });
    check();
  };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", observeHarnessMount, { once: true });
  else observeHarnessMount();
}
`;
const replacements=new Map([['lib/main.js',Buffer.from(main)],['lib/preload-app.cjs',Buffer.from(preload)]]);
for(const name of ['harness-splash.mjs','harness-splash.html','harness-splash.webm','harness-poster.jpg']){
  const archiveName=(name.endsWith('.mjs')?'lib/':'renderer/')+name;
  const data=fs.readFileSync(path.join(root,'package',name));
  replacements.set(archiveName,data);
  const folder=archiveName.split('/')[0];
  tree.files[folder].files[name]={size:data.length,offset:'0'};
}
const walk=(node,prefix='',out=[])=>{for(const [key,entry] of Object.entries(node.files??{})){const name=prefix?prefix+'/'+key:key;if(entry.files)walk(entry,name,out);else out.push({name,entry});}return out;};
let offset=0;
const body=[];
for(const {name,entry} of walk(tree)){
  if(entry.unpacked||entry.link)continue;
  const data=replacements.get(name)??content(name);
  entry.offset=String(offset);entry.size=data.length;offset+=data.length;body.push(data);
  if(replacements.has(name)){
    const blockSize=entry.integrity?.blockSize??4194304;
    const blocks=[];for(let i=0;i<data.length;i+=blockSize)blocks.push(sha(data.subarray(i,i+blockSize)));
    entry.integrity={algorithm:'SHA256',hash:sha(data),blockSize,blocks};
  }
}
const header=Buffer.from(JSON.stringify(tree));
const headerSize=8+Math.ceil(header.length/4)*4;
const prefix=Buffer.alloc(8+headerSize);
prefix.writeUInt32LE(4,0);prefix.writeUInt32LE(headerSize,4);prefix.writeUInt32LE(headerSize-4,8);prefix.writeUInt32LE(header.length,12);header.copy(prefix,16);
const result=Buffer.concat([prefix,...body]);
fs.mkdirSync(path.join(root,'delivery'),{recursive:true});
fs.writeFileSync(path.join(root,'delivery','app.asar'),result);
fs.writeFileSync(path.join(root,'review','patched-main.mjs'),main);
let unchanged=0;
for(const {name,entry} of walk(originalTree)){
  const next=lookup(tree,name);
  if(entry.unpacked||entry.link){assert.deepEqual(next,entry);continue;}
  const actual=result.subarray(prefix.length+Number(next.offset),prefix.length+Number(next.offset)+next.size);
  if(replacements.has(name)){assert.deepEqual(actual,replacements.get(name));continue;}
  assert.deepEqual(actual,content(name),'Unexpected change to '+name);unchanged++;
}
const manifest={original,originalSha256:sha(bytes),previousPatchedSha256:currentInstalledHash,patchedSha256:sha(result),bytes:result.length,unchangedPackedFiles:unchanged,addedFiles:[...replacements.keys()].filter(name=>!['lib/main.js','lib/preload-app.cjs'].includes(name)),video:{duration:4,width:3840,height:2160,fps:24,silent:true,codec:'vp9',crf:14,bytes:fs.statSync(path.join(root,'package','harness-splash.webm')).size,source:'D:/链接解析/results/7689378377203721211/live-photo-4k-repaired.mp4',resized:false},startupPolicy:'Original window sizes: centered 960x540 intro and default 1280x820 application; unchanged 4K animation; immediate handoff on UI readiness',storageRoot:'D:/dsh-latest-windows-x64/resources/harness-local-data'};
fs.writeFileSync(path.join(root,'delivery','manifest.json'),JSON.stringify(manifest,null,2));
const backup=path.join(root,'backup','app.original.asar');
if(!fs.existsSync(backup))fs.copyFileSync(original,backup);
assert.equal(sha(fs.readFileSync(backup)),manifest.originalSha256);
console.log(JSON.stringify(manifest,null,2));
