/** Bravo Relay v0.1: deterministic, browser-local demonstration engine.
 * No transport, authentication, live scheduler, carrier connection or cloud writes.
 * Do not treat this state as an authoritative audit log.
 */
export const TRAINERS = Object.freeze({david:'David', ashley:'Ashley', janet:'Janet'});
export const CLIENTS = Object.freeze({scout:'Jamie / Scout', luna:'Alex / Luna', rex:'Taylor / Rex'});
export const TYPES = Object.freeze({add:'Training days added',cancel:'Session canceled',move:'Session moved',renew:'Membership renewed',ending:'Membership ends tomorrow',last_day:'Final membership day',last_session:'Final scheduled session',assign:'Trainer reassigned'});
export const ACTIONABLE = new Set(['ready','handoff_requested']);
const EXPIRY = new Set(['ending','last_day']);
const MAX = 120;
function requireValue(condition,message){if(!condition) throw new Error(message);}
function copy(value){return structuredClone(value);}
export function initialState(){return {schema:1,events:[],outbox:[],routes:{scout:['ashley'],luna:['david'],rex:['david','ashley']},cycles:{scout:1,luna:1,rex:1},sequence:0};}
function recipients(ids){requireValue(Array.isArray(ids)&&ids.length>0&&ids.length<=3&&ids.every(x=>Object.hasOwn(TRAINERS,x)),'Select at least one known trainer.');return [...new Set(ids)].sort();}
function checkedText(value,max){requireValue(typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value),'Invalid event text.');return value.trim();}
export function normalizePhone(value){
 requireValue(typeof value==='string'&&value.length<=40,'Enter a valid US mobile number.');
 requireValue(/^[+\d ()\-.]+$/.test(value),'Use digits, spaces, +, parentheses or hyphens only.');
 let digits=value.replace(/\D/g,'');if(digits.length===10)digits='1'+digits;
 requireValue(/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits),'Enter a valid 10-digit US number, or +1 followed by 10 digits.');
 requireValue(!/^1\d{3}55501\d{2}$/.test(digits),'Example 555-01xx numbers cannot be used for a phone test.');
 return '+'+digits;
}
export function smsURI(number){return 'sms:'+normalizePhone(number);}
export function ingest(state,input){
 requireValue(state?.schema===1,'Unsupported local state.');
 requireValue(input&&typeof input==='object','Invalid event.');
 const event={id:checkedText(input.id,100),type:input.type,client:input.client,detail:checkedText(input.detail,220),at:input.at};
 requireValue(Object.hasOwn(TYPES,event.type)&&Object.hasOwn(CLIENTS,event.client),'Unknown event or demo client.');
 requireValue(typeof event.at==='string'&&Number.isFinite(Date.parse(event.at)),'Invalid event date.');
 if(event.type==='assign')event.trainers=recipients(input.trainers);
 const previous=state.events.find(x=>x.input.id===event.id);
 if(previous){requireValue(JSON.stringify(previous.input)===JSON.stringify(event),'Event ID was reused with different content.');return {state,duplicate:true};}
 requireValue(state.events.length<MAX,'This local demo holds 120 events. Reset the demo to continue.');
 const next=copy(state);const old=recipients(next.routes[event.client]);let targets=old;
 next.sequence++;
 if(event.type==='assign'){
   targets=[...new Set([...old,...event.trainers])].sort();next.routes[event.client]=event.trainers;
   for(const row of next.outbox){if(row.client===event.client&&ACTIONABLE.has(row.status)&&!event.trainers.includes(row.trainer)){
     row.status='superseded';row.reason='Trainer no longer assigned. Earlier change remains in the local history.';
   }}
 }
 if(event.type==='renew'){
   next.cycles[event.client]++;
   for(const row of next.outbox){if(row.client===event.client&&EXPIRY.has(row.type)&&ACTIONABLE.has(row.status)){
     row.status='superseded';row.reason='Membership renewed; this old expiration draft must not be handed off.';
   }}
 }
 const snapshot={input:event,sequence:next.sequence,recipients:targets,cycle:next.cycles[event.client]};
 next.events.push(snapshot);
 for(const trainer of targets){
   let detail=event.detail;
   if(event.type==='assign')detail='Assignment changed from '+old.map(x=>TRAINERS[x]).join(' + ')+' to '+event.trainers.map(x=>TRAINERS[x]).join(' + ')+'.';
   next.outbox.push({id:event.id+':'+trainer,eventId:event.id,client:event.client,type:event.type,trainer,sequence:next.sequence,at:event.at,cycle:next.cycles[event.client],detail,status:'ready',acknowledged:false,history:[]});
 }
 return {state:next,duplicate:false};
}
export function pending(state,trainer){return state.outbox.filter(r=>r.trainer===trainer&&ACTIONABLE.has(r.status));}
export function message(rows){
 requireValue(Array.isArray(rows)&&rows.length>0,'No current changes for this trainer.');
 requireValue(rows.every(r=>r.trainer===rows[0].trainer),'Never combine different trainers into one conversation.');
 return 'BRAVO RELAY - DEMO ONLY\n'+TRAINERS[rows[0].trainer]+': '+rows.length+' update'+(rows.length===1?'':'s')+'\n'+rows.map((r,i)=>(i+1)+'. '+CLIENTS[r.client]+' - '+r.detail).join('\n')+'\nFictional test data. No live appointment changed.';
}
export function transition(state,ids,action,at=new Date().toISOString()){
 requireValue(Array.isArray(ids)&&ids.length>0,'Select a current message.');
 requireValue(['handoff_requested','manual_reported','ready','cancelled','acknowledge'].includes(action),'Unknown local action.');
 const next=copy(state);
 for(const id of [...new Set(ids)]){
   const row=next.outbox.find(r=>r.id===id);requireValue(row,'Message no longer exists.');
   if(action==='acknowledge'){
     requireValue(row.status!=='superseded'&&row.status!=='cancelled','This notice is inactive.');row.acknowledged=true;
   }else{
     requireValue(row.status!=='superseded'&&row.status!=='cancelled','This draft is inactive.');
     if(action==='manual_reported')requireValue(row.status==='handoff_requested','Record a phone handoff first.');
     if(action==='handoff_requested')requireValue(ACTIONABLE.has(row.status),'This draft is not awaiting handoff.');
     row.status=action;
   }
   row.history.push({action,at});
 }
 return next;
}
export function restoreState(value){
 if(value==null)return initialState();
 requireValue(value?.schema===1&&Array.isArray(value.events)&&value.events.length<=MAX,'Local demo data is invalid.');
 let state=initialState();
 for(const item of value.events)state=ingest(state,item.input).state;
 requireValue(Array.isArray(value.outbox)&&value.outbox.length===state.outbox.length,'Local draft data is invalid.');
 for(const row of value.outbox){
   const rebuilt=state.outbox.find(r=>r.id===row.id);requireValue(rebuilt&&Array.isArray(row.history)&&row.history.length<=200,'Local history is invalid.');
   for(const record of row.history){
     requireValue(typeof record.at==='string'&&Number.isFinite(Date.parse(record.at)),'Invalid local history date.');
     // Historical handoffs may precede a later renewal or reassignment.
     requireValue(['handoff_requested','manual_reported','ready','cancelled','acknowledge'].includes(record.action),'Invalid local status.');
   }
   if(!['superseded','cancelled'].includes(rebuilt.status)){
     let status='ready';let ack=false;
     for(const record of row.history){
       if(record.action==='acknowledge'){ack=true;continue;}
       requireValue(status!=='cancelled','Invalid history after dismissal.');
       if(record.action==='manual_reported')requireValue(status==='handoff_requested','Invalid unverified send record.');
       if(record.action==='handoff_requested')requireValue(ACTIONABLE.has(status),'Invalid handoff history.');
       status=record.action;
     }
     rebuilt.status=status;rebuilt.acknowledged=ack;
   }
   rebuilt.history=copy(row.history);
 }
 return state;
}
