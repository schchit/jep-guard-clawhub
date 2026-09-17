import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {createDaemon,eventHash} from '../daemon.js';

const token='test-only-token-'+'x'.repeat(50);
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jep-plugin-test-'));fs.chmodSync(dir,0o700);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,daemon:createDaemon({dataDir:dir,token})};}
function request(daemon,url,{method='GET',headers={},body=null}={}){
 const req=new EventEmitter();req.url=url;req.method=method;req.headers={host:'127.0.0.1:9745',...headers};let raw='';
 const res={headers:{},statusCode:200,writableEnded:false,setHeader(k,v){this.headers[k]=v;},end(v=''){raw=v;this.writableEnded=true;}};
 daemon.handle(req,res);if(body!==null){req.emit('data',Buffer.from(body));req.emit('end');}
 return {status:res.statusCode,body:raw?JSON.parse(raw):null,headers:res.headers};
}
test('status requires auth and never exposes the token',t=>{
 const {daemon}=fixture(t);assert.equal(request(daemon,'/status').status,401);
 const result=request(daemon,'/status',{headers:{'x-jep-token':token}});
 assert.equal(result.status,200);assert(!JSON.stringify(result.body).includes(token));assert(!('authToken' in result.body));
 assert.deepEqual(request(daemon,'/health').body,{online:true,version:'1.2.0'});
});
test('pairing and untrusted origins cannot claim the daemon',t=>{
 const {daemon}=fixture(t);
 assert.equal(request(daemon,'/pair',{method:'POST',headers:{'x-jep-token':token}}).status,404);
 assert.equal(request(daemon,'/status',{headers:{origin:'https://evil.example','x-jep-token':token}}).status,403);
 assert.equal(request(daemon,'/status',{headers:{host:'evil.example','x-jep-token':token}}).status,403);
});
test('recording never treats a client status as an execution grant',t=>{
 const {daemon}=fixture(t);const event=daemon.record({who:'agent',status:'granted',payload:{x:1}});
 assert.equal(event.status,'recorded');assert.equal(eventHash(event),event.hash);
 const result=request(daemon,'/events',{headers:{'x-jep-token':token}});assert.equal(result.body.events.length,1);
 assert.throws(()=>daemon.record({who:'agent',nonce:event.nonce}));
});
test('log is durable, private, replay checked and verified at startup',t=>{
 const {daemon,dir}=fixture(t);const event=daemon.record({who:'agent'});
 const restarted=createDaemon({dataDir:dir,token});assert.equal(restarted.status().total_events,1);assert.throws(()=>restarted.record({who:'agent',nonce:event.nonce}));
 const file=path.join(dir,'events-v2.jsonl');assert.equal(fs.statSync(file).mode&0o077,0);
 fs.writeFileSync(file,JSON.stringify({...event,who:'tampered'})+'\n');assert.throws(()=>createDaemon({dataDir:dir,token}));
});
test('oversized JSON and wrong content types fail closed',t=>{
 const {daemon}=fixture(t);const headers={'x-jep-token':token,'content-type':'application/json'};
 assert.equal(request(daemon,'/judge',{method:'POST',headers,body:'x'.repeat(65537)}).status,413);
 assert.equal(request(daemon,'/judge',{method:'POST',headers:{'x-jep-token':token},body:'{}'}).status,415);
 assert.equal(request(daemon,'/judge',{method:'POST',headers,body:JSON.stringify({who:'agent',payload:{ok:true}})}).status,200);
});
test('invalid data directory and weak credentials are rejected',t=>{
 const {dir}=fixture(t);assert.throws(()=>createDaemon({dataDir:dir,token:'weak'}));fs.chmodSync(dir,0o755);assert.throws(()=>createDaemon({dataDir:dir,token}));
});
test('remote daemon URLs and content-script config writes are rejected',()=>{
 const callbacks={};const event=(name)=>({addListener(fn){callbacks[name]=fn;}});
 const chrome={storage:{local:{setAccessLevel(){},get(keys,fn){fn({});},set(){}},onChanged:event('storage')},runtime:{id:'extension-id',getURL:p=>'chrome-extension://extension-id/'+p,onInstalled:event('install'),onMessage:event('message'),sendMessage:async()=>{}},alarms:{onAlarm:event('alarm'),create(){},clear(){}},action:{setBadgeText(){},setBadgeBackgroundColor(){},setTitle(){}}};
 const ctx=vm.createContext({chrome,URL,console,AbortController,AbortSignal,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(new URL('../background.js',import.meta.url),'utf8'),ctx);
 assert.throws(()=>vm.runInContext("validateConfig({daemonHost:'https://remote.example',consentGiven:false})",ctx));
 let response;callbacks.message({type:'SAVE_CONFIG',payload:{}},{id:'extension-id',url:'https://clawhub.ai'},r=>response=r);
 assert.equal(response.success,false);
 callbacks.message({type:'GET_PUBLIC_CONFIG'},{id:'extension-id',url:'https://clawhub.ai'},r=>response=r);
 assert(!('daemonToken' in response));
});
test('extension pages contain no inline script and consistent versions',()=>{
 for(const name of ['onboarding','report'])assert(!/<script>/.test(fs.readFileSync(new URL('../'+name+'.html',import.meta.url),'utf8')));
 for(const name of ['package.json','manifest.json','clawhub.json','.codex-plugin/plugin.json','.claude-plugin/plugin.json'])assert.equal(JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8')).version,'1.2.0');
});

test('new credentials are private and never reuse the legacy state token',t=>{
 const {dir}=fixture(t);fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({authToken:token}));
 createDaemon({dataDir:dir});const file=path.join(dir,'auth-token');const fresh=fs.readFileSync(file,'utf8');
 assert.match(fresh,/^[a-f0-9]{64}$/);assert.notEqual(fresh,token);assert.equal(fs.statSync(file).mode&0o077,0);
 assert.equal(request(createDaemon({dataDir:dir}),'/status',{headers:{'x-jep-token':token}}).status,401);
 assert.equal(request(createDaemon({dataDir:dir}),'/status',{headers:{'x-jep-token':fresh}}).status,200);
});

test('clearing config cancels polling and rejects stale results and page reads',async()=>{
 const callbacks={};const event=name=>({addListener(fn){callbacks[name]=fn;}});let resolveFetch,clearCount=0;
 const saved={consentGiven:true,daemonHost:'http://127.0.0.1:9745',daemonToken:token,pollIntervalSec:5};
 const chrome={storage:{local:{setAccessLevel(){},get(keys,fn){fn({jepGuardConfig:saved});},set(v,fn){fn?.();}},onChanged:event('storage')},runtime:{id:'extension-id',getURL:p=>'chrome-extension://extension-id/'+p,onInstalled:event('install'),onMessage:event('message'),sendMessage:async()=>{}},alarms:{onAlarm:event('alarm'),create(){},clear(){clearCount++;}},action:{setBadgeText(){},setBadgeBackgroundColor(){},setTitle(){}}};
 const ctx=vm.createContext({chrome,URL,console,AbortSignal,fetch:()=>new Promise(resolve=>{resolveFetch=resolve;})});
 vm.runInContext(fs.readFileSync(new URL('../background.js',import.meta.url),'utf8'),ctx);
 const pending=vm.runInContext('pollDaemon()',ctx);
 callbacks.storage({jepGuardConfig:{oldValue:saved,newValue:undefined}},'local');
 resolveFetch({ok:true,json:async()=>({total_events:10})});await pending;
 assert.equal(vm.runInContext('config.consentGiven',ctx),false);assert.equal(vm.runInContext('lastState.online',ctx),false);assert(clearCount>0);
 let response;callbacks.message({type:'GET_STATE'},{id:'extension-id',url:'https://clawhub.ai'},r=>response=r);assert.equal(response.success,false);
});

test('page metadata cannot inject HTML through an annotation',()=>{
 const notes=[];const card={querySelector(){return notes[0]||null;},appendChild(note){notes.push(note);}};
 const node={dataset:{},set innerHTML(value){throw Error('Unexpected HTML sink');},remove(){notes.splice(notes.indexOf(this),1);}};
 const document={body:{},querySelectorAll(selector){return selector==='[data-jep-note]'?[...notes]:[card];},createElement(){return node;}};
 const chrome={runtime:{sendMessage(msg,fn){fn({consentGiven:true,clawhubEnhance:true,clawhubBadge:true});},onMessage:{addListener(){}}}};
 const ctx=vm.createContext({document,chrome,window:{addEventListener(){}},MutationObserver:class{observe(){}disconnect(){}}});
 vm.runInContext(fs.readFileSync(new URL('../content-clawhub.js',import.meta.url),'utf8'),ctx);
 assert.equal(notes.length,1);assert.match(notes[0].textContent,/review the security audit/);
});
