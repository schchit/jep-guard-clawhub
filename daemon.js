#!/usr/bin/env node
/** Local evidence recorder. No automatic pairing or execution authorization. */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';

export function canonical(value) {
  if(value===null || typeof value==='boolean' || typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number' && Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  throw Error('Unsupported JSON value');
}
export function eventHash(event){const {hash,...body}=event;return crypto.createHash('sha256').update(canonical(body)).digest('hex');}
function privateRead(file) {
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>16777216||(stat.mode&0o077))throw Error('Private file permissions or size invalid');return fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}
}
export function createDaemon({dataDir=path.join(os.homedir(),'.jep-data'),port=9745,token=process.env.JEP_AUTH_TOKEN}={}) {
  port=Number(port);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(dataDir);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)||(process.getuid&&stat.uid!==process.getuid()))throw Error('Data directory must be private and owned by the current user');
  const authFile=path.join(dataDir,'auth-token'),eventFile=path.join(dataDir,'events-v2.jsonl');
  if(!token) {
    if(fs.existsSync(authFile))token=privateRead(authFile).trim();
    else {token=crypto.randomBytes(32).toString('hex');fs.writeFileSync(authFile,token,{mode:0o600,flag:'wx'});}
  }
  if(typeof token!=='string'||!/^\S{43,256}$/.test(token))throw Error('Token must contain at least 43 non-whitespace characters');
  const tokenHash=crypto.createHash('sha256').update(token).digest();
  let events=[];const nonces=new Set();
  if(fs.existsSync(eventFile)) {
    for(const line of privateRead(eventFile).split('\n').filter(Boolean)) {
      const event=JSON.parse(line);
      if(event.hash!==eventHash(event)||event.prev!==(events.at(-1)?.hash||null)||nonces.has(event.nonce))throw Error('Audit log integrity or replay error');
      nonces.add(event.nonce);events.push(event);
    }
  }
  function status(){const by_verb={J:0,D:0,V:0,T:0};for(const e of events)by_verb[e.verb]++;return {online:true,paired:true,daemon_version:'1.2.0',total_events:events.length,by_verb,chain_head:events.at(-1)?.hash||null,active_mode:'local_recorder'};}
  function record(data) {
    if(events.length>=10000)throw Error('Archive the log before accepting more events');
    if(typeof data.who!=='string'||!data.who||data.who.length>256)throw Error('A bounded issuer label is required');
    const nonce=data.nonce||crypto.randomUUID();
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(nonce)||nonces.has(nonce))throw Error('Invalid or replayed nonce');
    const payload=data.payload??{};
    const event={who:data.who,verb:'J',nonce,when:Math.floor(Date.now()/1000),status:'recorded',payload,prev:events.at(-1)?.hash||null};
    const body=canonical(event);if(Buffer.byteLength(body)>65536)throw Error('Event too large');
    event.hash=eventHash(event);
    const line=canonical(event)+'\n';
    const fd=fs.openSync(eventFile,fs.constants.O_CREAT|fs.constants.O_APPEND|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
    try {const st=fs.fstatSync(fd);if(!st.isFile()||(st.mode&0o077)||(process.getuid&&st.uid!==process.getuid()))throw Error('Audit log must remain private');if(st.size+Buffer.byteLength(line)>16777216)throw Error('Archive the log before continuing');const bytes=Buffer.from(line);let written=0;while(written<bytes.length){const n=fs.writeSync(fd,bytes,written);if(n<=0)throw Error('Incomplete audit write');written+=n;}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    nonces.add(nonce);events.push(event);return event;
  }
  const configuredOrigin=process.env.JEP_EXTENSION_ORIGIN;
  function originAllowed(origin){return !origin||(configuredOrigin?origin===configuredOrigin:/^(?:chrome|edge)-extension:\/\/[a-p]{32}$|^moz-extension:\/\/[a-f0-9-]{36}$/.test(origin));}
  function reply(res,code,value){res.statusCode=code;res.end(JSON.stringify(value));}
  function handle(req,res) {
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!originAllowed(req.headers.origin))return reply(res,403,{error:'Origin or host rejected'});
    if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-JEP-Token');
    if(req.method==='OPTIONS')return reply(res,204,{});
    let url;try{url=new URL(req.url,'http://127.0.0.1:'+port);}catch{return reply(res,400,{error:'Invalid URL'});}
    if(url.pathname==='/health'&&req.method==='GET')return reply(res,200,{online:true,version:'1.2.0'});
    const supplied=req.headers['x-jep-token'];
    if(typeof supplied!=='string'||supplied.length>256||!crypto.timingSafeEqual(tokenHash,crypto.createHash('sha256').update(supplied).digest()))return reply(res,401,{error:'Authentication required'});
    if(req.method==='GET'&&url.pathname==='/status')return reply(res,200,status());
    if(req.method==='GET'&&url.pathname==='/events'){
      const since=url.searchParams.get('since'),agent=url.searchParams.get('agent'),verb=url.searchParams.get('verb');
      if(since!==null&&!/^\d{1,12}$/.test(since))return reply(res,400,{error:'Invalid since'});
      return reply(res,200,{events:events.filter(e=>(since===null||e.when>=Number(since))&&(!agent||e.who===agent)&&(!verb||e.verb===verb)).slice(-100)});
    }
    if(req.method==='GET'&&url.pathname==='/skills')return reply(res,200,{skills:[],supported:false});
    if(req.method==='GET'&&url.pathname==='/session-graph')return reply(res,200,[]);
    if(req.method==='POST'&&url.pathname==='/judge'){
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return reply(res,415,{error:'JSON required'});
      let bytes=0,chunks=[],tooLarge=false;
      req.on('data',chunk=>{bytes+=chunk.length;if(bytes>65536){if(!tooLarge)reply(res,413,{error:'Body too large'});tooLarge=true;chunks=[];}else if(!tooLarge)chunks.push(Buffer.from(chunk));});
      req.on('end',()=>{if(tooLarge)return;try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Object required');reply(res,200,{success:true,event:record(data)});}catch{return reply(res,400,{error:'Invalid event or unavailable storage'});}});
      req.on('error',()=>{if(!res.writableEnded)reply(res,400,{error:'Interrupted request'});});return;
    }
    return reply(res,404,{error:'Unsupported endpoint or method'});
  }
  const server=http.createServer(handle);server.requestTimeout=5000;server.headersTimeout=5000;server.maxConnections=32;
  return {server,handle,record,status,port,dataDir};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const daemon=createDaemon({dataDir:process.env.JEP_DATA_DIR,port:process.env.JEP_PORT||9745});
  daemon.server.listen(daemon.port,'127.0.0.1',()=>console.log(`JEP local recorder on 127.0.0.1:${daemon.port}. Configure the extension with the private token file in ${daemon.dataDir}; no automatic pairing occurs.`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>daemon.server.close(()=>process.exit(0)));
}
