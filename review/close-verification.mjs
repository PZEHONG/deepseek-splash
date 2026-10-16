import fs from 'node:fs';
const lines=fs.readFileSync('D:/dsh-latest-windows-x64/resources/harness-local-data/desktop/DevToolsActivePort','utf8').trim().split('\n');
const socket=new WebSocket('ws://127.0.0.1:'+lines[0]+lines[1]);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
socket.send(JSON.stringify({id:1,method:'Browser.close'}));
await Promise.race([new Promise(resolve=>socket.addEventListener('close',resolve,{once:true})),new Promise(resolve=>setTimeout(resolve,3500))]);
socket.close();
