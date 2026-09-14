import { useRef, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { Notice, formatDate } from './ui';
import { creditableTerm, creditPlacementDates, planCreditDays } from '../../shared/day-credits';
import './day-credits.css';

export default function CreditActions({ data, date, onSaved, disabled = false, embedded = false, onBusyChange, onOpenChange }) {
  const { user } = useBravo();
  const [open,setOpen]=useState(false),[target,setTarget]=useState(''),[days,setDays]=useState('1'),[termId,setTermId]=useState('');
  const [weekends,setWeekends]=useState(false),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(null);
  if(!['staff','owner'].includes(user?.role))return null;
  const terms=(data.terms||[]).filter(creditableTerm);
  const credit=date&&(data.dayCredits||[]).find(item=>creditPlacementDates(item).includes(date)&&terms.some(term=>term.stripeId===item.termId));
  if(date&&!credit)return null;
  const term=credit?terms.find(item=>item.stripeId===credit.termId):terms.find(item=>item.stripeId===termId)||terms[0];
  const count=Number(days), validCount=Number.isInteger(count)&&count>0&&count<=366;
  const plan=term&&!credit&&validCount?planCreditDays(term.validUntil,count,weekends):null;
  async function save(event) {
    event.preventDefault();if(busy||disabled||!term)return;setBusy(true);onBusyChange?.(true);setError('');
    const body=credit?{clientId:data.client.id,creditId:credit._id,expectedRevision:credit.revision||0,from:date,to:target,includeWeekends:weekends,note}:{clientId:data.client.id,termId:term.stripeId,expectedEnd:term.validUntil,days:count,includeWeekends:weekends,note};
    const signature=JSON.stringify(body);if(pending.current?.signature!==signature)pending.current={signature,requestKey:crypto.randomUUID()};
    try{
      const result=await api(credit?'/client-schedule/credits/move':'/client-schedule/credits',{method:'POST',body:{...body,requestKey:pending.current.requestKey}});
      onSaved(result.message,credit?result.date:result.credit.creditDates.at(-1));
    }catch(err){setError(err.message)}finally{setBusy(false);onBusyChange?.(false)}
  }
  const Form=embedded?'div':'form';
  return <section className="calendar-credit-action" aria-label={credit?'Move credit':'Add credit days'}>
    <button type="button" className="button button-ghost" disabled={busy||disabled} onClick={()=>{setOpen(!open);onOpenChange?.(!open)}}>{credit?'Move credit':'Add credit days'}</button>
    {disabled&&<p className="helper">Save or reset your schedule changes first.</p>}
    {open&&(!term?<p>Set up a dated training membership before adding credits.</p>:<Form onSubmit={embedded?undefined:save}><fieldset disabled={busy||disabled}>
      {credit?<><p>Move the credit from <strong>{formatDate(date)}</strong>.</p><label>Move credit to<input type="date" required value={target} onChange={e=>setTarget(e.target.value)}/></label><p className="helper">This moves the Credit day. Any booked visit keeps its saved date and time.</p></>:<>
        {terms.length>1&&<label>Membership<select value={term.stripeId} onChange={e=>setTermId(e.target.value)}>{terms.map(item=><option key={item.stripeId} value={item.stripeId}>{formatDate(item.validFrom.slice(0,10))} – {formatDate(item.validUntil.slice(0,10))}</option>)}</select></label>}
        <label>Number of credit days<input type="number" min="1" max="366" step="1" required value={days} onChange={e=>setDays(e.target.value)}/></label>
        {plan&&<p>{count} credit {count===1?'day':'days'}: {formatDate(plan.dates[0])}{count>1&&<> through {formatDate(plan.dates.at(-1))}</>}.</p>}
      </>}
      <label className="check-label"><input type="checkbox" checked={weekends} onChange={e=>setWeekends(e.target.checked)}/>Include weekends</label>
      <label>Note (optional)<textarea maxLength={1200} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <Notice error>{error}</Notice><button type={embedded?'button':'submit'} onClick={embedded?save:undefined} className="button" disabled={credit?(!target||target===date):!validCount}>{busy?'Saving…':'Save credit'}</button><button type="button" className="quiet-button" onClick={()=>{setOpen(false);onOpenChange?.(false)}}>Cancel</button>
    </fieldset></Form>)}
  </section>;
}
