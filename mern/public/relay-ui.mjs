import {TRAINERS,CLIENTS,TYPES,ACTIONABLE,initialState,ingest,pending,message,transition,restoreState,normalizePhone,smsURI} from './relay-core.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const liveHosts=new Set(['bravounleashed.com','www.bravounleashed.com','bravo-k9-mern.vercel.app','bravo-k9-mern-ghostnet1.vercel.app','bravo-k9-mern-git-bravo-mern-ghostnet1.vercel.app']);
if(liveHosts.has(location.hostname)){document.body.textContent='Bravo Relay is staging-only. This build is not authorized on a production domain.';throw new Error('Production host blocked.');}
const KEY='bravo.relay.lab.v1';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const details={add:'Added 10 demo training days in one saved change. Review the updated plan.',cancel:'Canceled the demo session on Oct 12 at 4:00 PM Central.',move:'Moved the demo session from Oct 12, 4:00 PM to Oct 13, 5:00 PM Central.',renew:'Membership renewal succeeded for a new demo membership cycle.',ending:'The current demo membership ends tomorrow. This is not the last-session reminder.',last_day:'Today is the final active day of the demo membership.',last_session:'The final booked demo session is Oct 16 at 4:00 PM Central. Membership may end on a different day.',assign:'Demo trainer assignment changed.'};
let state=initialState(),lastInput=null,storageOK=true,loadWarning='',activeIDs=[],returnFocus=null,testPhone='',toastTimer;
try{state=restoreState(JSON.parse(sessionStorage.getItem(KEY)||'null'));lastInput=state.events.at(-1)?.input||null;}catch{loadWarning='Local demo data could not be restored. A fresh demonstration has been opened.';}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),6000);}
function save(){try{sessionStorage.setItem(KEY,JSON.stringify(state));storageOK=true;}catch{storageOK=false;}}
function clock(at){return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Chicago'}).format(new Date(at))+' Central';}
function assignment(){const ids=state.routes[$('#client').value];$('#assignment').textContent='Assigned to '+ids.map(id=>TRAINERS[id]).join(' + ');$('#assign-options').hidden=$('#event-type').value!=='assign';$('#event-detail').textContent=details[$('#event-type').value];}
function statusName(row){return ({ready:'Ready for review',handoff_requested:'Handoff requested · unverified',manual_reported:'Manually reported · unverified',cancelled:'Dismissed locally',superseded:'Outdated · do not send'})[row.status]||'Unknown';}
function empty(title,copy){return `<div class="empty"><div><span aria-hidden="true">↗</span><h3>${escape(title)}</h3><p>${escape(copy)}</p></div></div>`;}
function notice(row,trainerView=false){return `<article class="notice"><div class="notice-top"><h4>${escape(CLIENTS[row.client])} / ${escape(TYPES[row.type])}</h4><span class="status ${ACTIONABLE.has(row.status)?'':'inactive'}">${escape(statusName(row))}</span></div><p>${escape(row.detail)}</p>${row.reason?`<p class="reason">${escape(row.reason)}</p>`:''}<div class="notice-foot"><span>#${String(row.sequence).padStart(3,'0')} · ${escape(clock(row.at))}</span>${trainerView?(['cancelled','superseded'].includes(row.status)?'':`<button data-ack="${escape(row.id)}" ${row.acknowledged?'disabled':''}>${row.acknowledged?'Acknowledged in demo':'Acknowledge in demo ✓'}</button>`):ACTIONABLE.has(row.status)?`<button data-dismiss="${escape(row.id)}">Dismiss draft</button>`:''}</div></article>`;}
function render(){
 $('#metric-events').textContent=state.events.length;
 $('#metric-pending').textContent=state.outbox.filter(r=>ACTIONABLE.has(r.status)).length;
 $('#metric-handled').textContent=state.outbox.filter(r=>r.status==='manual_reported').length;
 $('#routing-list').innerHTML=Object.entries(CLIENTS).map(([id,name])=>`<div class="route-row"><strong>${escape(name)}</strong><span>${state.routes[id].map(t=>TRAINERS[t]).join(' + ')}</span></div>`).join('');
 assignment();$('#replay').disabled=!lastInput;
 const filter=$('#filter').value;
 const rows=state.outbox.filter(r=>filter==='all'||(filter==='pending'?ACTIONABLE.has(r.status):['manual_reported','cancelled','superseded'].includes(r.status)));
 $('#outbox').innerHTML=Object.entries(TRAINERS).map(([id,name])=>{
  const list=rows.filter(r=>r.trainer===id);if(!list.length)return '';
  const ready=pending(state,id);
  return `<div class="trainer-batch"><div class="batch-head"><span class="avatar">${name[0]}</span><div><h3>${name}</h3><small>Assigned-trainer route · demo account</small></div><span class="pill">${list.length} ${list.length===1?'DRAFT':'DRAFTS'}</span></div>${list.slice().reverse().map(r=>notice(r)).join('')}${ready.length?`<div class="batch-foot"><p>One trainer at a time.<br>Up to 4 updates in each reviewed digest.</p><button class="primary" data-compose="${id}">Review ${Math.min(4,ready.length)} ${ready.length===1?'update':'updates'} <span>↗</span></button></div>`:''}</div>`;
 }).join('')||empty('A quieter kind of inbox.', 'Save a demo change or load an example day. Its trainer draft will appear here.');
 const trainerRows=state.outbox.filter(r=>r.trainer===$('#trainer-select').value);
 $('#trainer-inbox').innerHTML=trainerRows.length?`<div class="trainer-batch">${trainerRows.slice().reverse().map(r=>notice(r,true)).join('')}</div>`:empty('Nothing on this route yet.', 'Choose a client assigned to this trainer, then save a demo change.');
 $('#activity').innerHTML=state.events.length?state.events.slice(-5).reverse().map(e=>`<div class="activity-item"><div><strong>${escape(TYPES[e.input.type])}</strong><br>${escape(CLIENTS[e.input.client])} → ${e.recipients.map(id=>TRAINERS[id]).join(' + ')}</div><time>${escape(clock(e.input.at))}</time></div>`).join(''):'<p class="tiny muted">No simulated scheduler activity yet.</p>';
 $('#storage-note').textContent=loadWarning||(storageOK?'Demo state stays in this browser tab’s session storage. It is not shared or authoritative.':'Browser storage is unavailable. Changes exist on this page only and may be lost on refresh.');
}
function run(type=$('#event-type').value,client=$('#client').value){
 const input={id:'demo-'+crypto.randomUUID(),type,client,detail:details[type],at:new Date().toISOString()};
 if(type==='assign')input.trainers=$('#assign-to').value.split(',');
 const result=ingest(state,input);state=result.state;lastInput=input;save();render();
 return input;
}
$('#event-form').addEventListener('submit',event=>{event.preventDefault();try{run();toast('Demo change saved. Trainer drafts are ready; no message was sent.');}catch(error){toast(error.message);}});
$('#client').addEventListener('change',assignment);$('#event-type').addEventListener('change',assignment);
$('#filter').addEventListener('change',render);$('#trainer-select').addEventListener('change',render);
$('#replay').addEventListener('click',()=>{try{const result=ingest(state,lastInput);state=result.state;render();toast(result.duplicate?'Duplicate ignored. The same event did not create another draft.':'Demo event recorded.');}catch(error){toast(error.message);}});
$('#seed').addEventListener('click',()=>{try{for(const [type,client]of [['cancel','scout'],['add','scout'],['ending','luna'],['move','rex']])run(type,client);toast('Example day loaded: 4 fictional changes, 5 routed drafts, no SMS sent.');}catch(error){toast(error.message);}});
function view(trainer){$('#owner-view').hidden=trainer;$('#trainer-view').hidden=!trainer;$('#owner-tab').classList.toggle('active',!trainer);$('#trainer-tab').classList.toggle('active',trainer);$('#owner-tab').setAttribute('aria-pressed',String(!trainer));$('#trainer-tab').setAttribute('aria-pressed',String(trainer));render();}
$('#owner-tab').onclick=()=>view(false);$('#trainer-tab').onclick=()=>view(true);
function open(id){returnFocus=document.activeElement;$('#'+id).showModal();}
$$('dialog').forEach(dialog=>{dialog.addEventListener('close',()=>{if(dialog.id==='compose'){testPhone='';$('#test-phone').value='';$('#open-messages').removeAttribute('href');$('#consent').checked=false;activeIDs=[];}if(returnFocus?.isConnected)returnFocus.focus();});dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});});
$('#how-open').onclick=()=>open('how');
function activeRows(){const rows=activeIDs.map(id=>state.outbox.find(r=>r.id===id));if(!rows.length||rows.some(r=>!r||!ACTIONABLE.has(r.status)))throw new Error('This draft changed or is no longer active. Close it and review the current outbox.');return rows;}
function compose(trainer){
 const rows=pending(state,trainer).slice(0,4);if(!rows.length){toast('No active drafts for this trainer.');return;}
 activeIDs=rows.map(r=>r.id);$('#draft').value=message(rows);$('#draft-count').textContent=$('#draft').value.length+' characters. Your phone may split long SMS or choose RCS / iMessage.';
 $('#compose-summary').textContent='Routing preview: '+TRAINERS[trainer]+' · '+rows.length+' fictional '+(rows.length===1?'update':'updates')+'. This test uses your number, not the trainer’s real phone.';
 testPhone='';$('#test-phone').value='';$('#consent').checked=false;$('#manual-confirm').checked=false;$('#report-sent').disabled=true;$('#report-section').hidden=true;$('#copy-status').textContent='Copy first; paste into Messages after opening.';$('#phone-error').textContent='';updatePhone();open('compose');
}
function updatePhone(){
 let number='';try{number=normalizePhone($('#test-phone').value);$('#phone-error').textContent='';}catch(error){if($('#test-phone').value)$('#phone-error').textContent=error.message;}
 const ready=number&&$('#consent').checked;const link=$('#open-messages');link.classList.toggle('disabled',!ready);link.setAttribute('aria-disabled',String(!ready));
 if(ready){testPhone=number;link.href=smsURI(number);}else{testPhone='';link.removeAttribute('href');}
}
$('#test-phone').addEventListener('input',updatePhone);$('#consent').addEventListener('change',updatePhone);
$('#copy').addEventListener('click',async()=>{
 try{activeRows();}catch(error){toast(error.message);return;}
 try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText($('#draft').value);$('#copy-status').textContent='Copied. Open Messages, paste, verify your recipient, then tap Send.';}
 catch{$('#draft').focus();$('#draft').select();$('#copy-status').textContent='Automatic copy was unavailable. The text is selected: use your device’s Copy command, then open Messages.';}
});
$('#open-messages').addEventListener('click',event=>{
 try{
  if(!testPhone||!$('#consent').checked)throw new Error('Enter your own test number and check the acknowledgment first.');
  activeRows();state=transition(state,activeIDs,'handoff_requested');save();render();$('#report-section').hidden=false;
  $('#copy-status').textContent='Messages launch requested. We cannot tell whether it opened or whether you sent a message.';
  // A normal user-initiated sms: link opens the OS composer. No transport or sent callback.
 }catch(error){event.preventDefault();$('#phone-error').textContent=error.message;}
});
$('#manual-confirm').addEventListener('change',()=>{$('#report-sent').disabled=!$('#manual-confirm').checked;});
$('#report-sent').addEventListener('click',()=>{try{if(!$('#manual-confirm').checked)return;state=transition(state,activeIDs,'manual_reported');save();$('#compose').close();render();toast('Recorded as manually reported. No delivery receipt is available.');}catch(error){toast(error.message);}});
$('#reset').addEventListener('click',()=>{if(!confirm('Clear all fictional changes and local manual-send records in this demo tab?'))return;state=initialState();lastInput=null;loadWarning='';save();render();toast('Local demonstration cleared. No live data changed.');});
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;try{if(button.hasAttribute('data-close'))button.closest('dialog').close();if(button.dataset.compose)compose(button.dataset.compose);if(button.dataset.dismiss){state=transition(state,[button.dataset.dismiss],'cancelled');save();render();toast('Draft dismissed locally. No message sent.');}if(button.dataset.ack){state=transition(state,[button.dataset.ack],'acknowledge');save();render();toast('Demo acknowledgment saved on this tab only.');}}catch(error){toast(error.message);}});
render();
