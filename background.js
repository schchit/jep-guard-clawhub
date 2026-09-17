chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
function validateConfig(value){
  const url=new URL(value.daemonHost);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Daemon must be a loopback HTTP origin');
  if(!Number.isInteger(value.pollIntervalSec)||value.pollIntervalSec<2||value.pollIntervalSec>60)throw Error('Poll interval must be 2–60 seconds');
  if(value.consentGiven&&(!value.daemonToken||!/^\S{43,256}$/.test(value.daemonToken)))throw Error('Configure the local daemon token first');
}
const DEFAULTS={daemonHost:'http://127.0.0.1:9745',daemonToken:null,pollIntervalSec:5,notifications:false,overlayEnabled:false,clawhubEnhance:false,theme:'auto',firstRun:true,consentGiven:false,version:'1.2.0',tokenBudget:{enabled:false,dailyLimit:1000000,strategy:'prune'},mcpOptimizer:{dedup:true,batchWindowMs:200,maxConcurrent:3}};
let config={...DEFAULTS},lastState={online:false,stats:null},isPolling=false,configEpoch=0;

chrome.runtime.onInstalled.addListener(d=>{if(d.reason==='install'){chrome.storage.local.set({jepGuardConfig:{...DEFAULTS}});chrome.tabs.create({url:chrome.runtime.getURL('onboarding.html')});}if(d.reason==='update'){chrome.storage.local.get(['jepGuardConfig'],r=>{if(r.jepGuardConfig){config={...config,...r.jepGuardConfig};if(config.consentGiven&&config.daemonHost)startPolling();}});}});
chrome.storage.local.get(['jepGuardConfig'],r=>{if(r.jepGuardConfig){config={...config,...r.jepGuardConfig};if(config.consentGiven&&config.daemonHost)startPolling();}});
chrome.storage.onChanged.addListener((c,a)=>{if(a==='local'&&c.jepGuardConfig){configEpoch++;config={...DEFAULTS,...c.jepGuardConfig.newValue};stopPolling();if(config.consentGiven)startPolling();notifyContent();}});

function startPolling(){try{validateConfig(config);}catch{stopPolling();return;}if(isPolling||!config.consentGiven)return;isPolling=true;chrome.alarms.create('jep-poll',{periodInMinutes:Math.max(config.pollIntervalSec/60,0.08)});}
function stopPolling(){isPolling=false;chrome.alarms.clear('jep-poll');lastState={online:false,stats:null};updateBadgeOffline();}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='jep-poll'&&config.consentGiven)pollDaemon();});

async function pollDaemon(){
  const epoch=configEpoch;
  if(!config.consentGiven)return;
  try{
    validateConfig(config);

    const headers={};
    if(config.daemonToken)headers['X-JEP-Token']=config.daemonToken;
    const r=await fetch(config.daemonHost+'/status',{signal:AbortSignal.timeout(3000),redirect:'error',headers});

    if(!r.ok)throw new Error('offline');
    const d=await r.json();

    if(epoch!==configEpoch||!config.consentGiven)return;
    lastState={online:true,stats:d};
    updateBadge(d);
    chrome.runtime.sendMessage({type:'STATE_UPDATE',payload:lastState}).catch(()=>{});
  }catch(e){
    lastState={online:false,stats:null};
    updateBadgeOffline();
    chrome.runtime.sendMessage({type:'STATE_UPDATE',payload:lastState}).catch(()=>{});
  }
}

function updateBadge(d){const t=d?.total_events||0,b=d?.blocked_last_hour||0,c=b?'#EF4444':'#10B981',tx=t>99?'99+':String(t||'');chrome.action.setBadgeText({text:tx});chrome.action.setBadgeBackgroundColor({color:c});chrome.action.setTitle({title:`JEP Guard — ${t} events · local recorder connected`});}
function updateBadgeOffline(){chrome.action.setBadgeText({text:''});chrome.action.setBadgeBackgroundColor({color:'#9CA3AF'});chrome.action.setTitle({title:'JEP Guard — Paused. Open settings to enable.'});}

chrome.runtime.onMessage.addListener((m,s,rs)=>{
  const trusted=s.id===chrome.runtime.id && typeof s.url==='string' && s.url.startsWith(chrome.runtime.getURL(''));
  if(m.type==='GET_PUBLIC_CONFIG'){rs({consentGiven:config.consentGiven,clawhubEnhance:config.consentGiven&&config.clawhubEnhance,clawhubGate:config.clawhubGate,clawhubBadge:config.clawhubBadge,clawhubAutoRisk:config.clawhubAutoRisk});return false;}
  if(!trusted){rs({success:false,error:'Extension settings access required'});return false;}

  if(m.type==='GET_STATE'){rs({success:true,data:lastState,consent:config.consentGiven});return true;}
  if(m.type==='GET_EVENTS'){if(!config.consentGiven){rs({success:false,error:'Consent not given'});return true;}fetchEvents(m.filter).then(r=>rs({success:true,data:r})).catch(e=>rs({success:false,error:e.message}));return true;}
  if(m.type==='GET_SKILLS'){if(!config.consentGiven){rs({success:false,error:'Consent not given'});return true;}fetchSkills().then(r=>rs({success:true,data:r})).catch(e=>rs({success:false,error:e.message}));return true;}
  if(m.type==='SAVE_CONFIG'){m.payload={...m.payload,clawhubGate:false,clawhubAutoRisk:false,overlayEnabled:false,tokenBudget:{enabled:false}};try{validateConfig({...config,...m.payload});}catch(e){rs({success:false,error:e.message});return false;}chrome.storage.local.set({jepGuardConfig:{...config,...m.payload}},()=>{configEpoch++;config={...config,...m.payload};stopPolling();if(config.consentGiven)startPolling();notifyContent();rs({success:true});});return true;}
  if(m.type==='REVOKE_ALL'){configEpoch++;config={...DEFAULTS,consentGiven:false};chrome.storage.local.set({jepGuardConfig:config},()=>{stopPolling();notifyContent();rs({success:true});});return true;}
  if(m.type==='REQUEST_NOTIFICATION_PERM'){chrome.permissions.request({permissions:['notifications']},g=>rs({success:g}));return true;}
  if(m.type==='REQUEST_HOST_PERM'){chrome.permissions.request({origins:['https://clawhub.ai/*','https://*.clawhub.ai/*']},g=>rs({success:g}));return true;}
  if(m.type==='SHOW_NOTIFICATION'){
    if(!config.consentGiven||!config.notifications||!chrome.notifications){rs({success:false,error:'Notifications not available'});return true;}
    chrome.notifications.create({type:'basic',iconUrl:'icon128.png',title:m.title||'JEP Guard',message:m.message||'',priority:m.priority==='high'?2:1});
    rs({success:true});return true;
  }
  if(m.type==='GET_SESSION_GRAPH'){
    if(!config.consentGiven){rs({success:false,error:'Consent not given'});return true;}
    fetchSessionGraph().then(r=>rs({success:true,data:r})).catch(e=>rs({success:false,error:e.message}));
    return true;
  }
});

async function fetchEvents(f={}){
  validateConfig(config);
  const u=new URL(config.daemonHost+'/events');
  if(f.since)u.searchParams.set('since',f.since);
  if(f.agent)u.searchParams.set('agent',f.agent);
  if(f.verb)u.searchParams.set('verb',f.verb);
  const headers={};if(config.daemonToken)headers['X-JEP-Token']=config.daemonToken;
  const r=await fetch(u.toString(),{signal:AbortSignal.timeout(3000),redirect:'error',headers});
  if(!r.ok)throw new Error('Failed to fetch events');
  return r.json();
}

async function fetchSkills(){
  validateConfig(config);
  const headers={};if(config.daemonToken)headers['X-JEP-Token']=config.daemonToken;
  const r=await fetch(config.daemonHost+'/skills',{signal:AbortSignal.timeout(3000),redirect:'error',headers});
  if(!r.ok)throw new Error('Failed to fetch skills');
  return r.json();
}

async function fetchSessionGraph(){
  validateConfig(config);
  const headers={};if(config.daemonToken)headers['X-JEP-Token']=config.daemonToken;
  const r=await fetch(config.daemonHost+'/session-graph',{signal:AbortSignal.timeout(3000),redirect:'error',headers});
  if(!r.ok)throw new Error('Failed to fetch session graph');
  return r.json();
}


function notifyContent(){chrome.tabs?.query({url:['https://clawhub.ai/*','https://*.clawhub.ai/*']},tabs=>{for(const tab of tabs||[])if(tab.id)chrome.tabs.sendMessage(tab.id,{type:'PUBLIC_CONFIG_CHANGED'}).catch(()=>{});});}
