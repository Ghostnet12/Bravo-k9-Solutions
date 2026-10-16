import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';
import { CONTENT_FONTS } from '../../shared/site-content.js';

export default function ContentEditor({ options, entries, publish, close, preview, record, editRecord }) {
  const dialog=useRef(null);
  const [key,setKey]=useState(options[0].key), [draft,setDraft]=useState(entries[options[0].key]?.value || {}), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const drafts=useRef({});
  const selected=options.find(item=>item.key===key), baseline=entries[key] || {revision:0,value:{}};
  const changed = (itemKey, value) => JSON.stringify(value) !== JSON.stringify(entries[itemKey]?.value || {});
  const otherDirty = Object.entries(drafts.current).some(([itemKey, value]) => itemKey !== key && changed(itemKey, value));
  const dirty = changed(key, draft) || otherDirty;
  const requestClose = () => { if (busy || (dirty && !window.confirm('Discard your unpublished changes?'))) return false; close(); return true; };
  useLayoutEffect(() => { const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const change=(name,value)=>setDraft(old=>({...old,[name]:value}));
  async function uploadBackground(file) {
    if(!file)return;setBusy(true);setError('');
    try {
      const { optimizeSitePhoto } = await import('./site-image-editor');
      const {data,contentType,filename} = await optimizeSitePhoto(file);
      // A new slot keeps an unpublished upload from changing the live background.
      const result=await api(`/site-images/background-${crypto.randomUUID()}`,{method:'PUT',body:{expectedRevision:0,data,contentType,filename,alt:'Section background',x:50,y:50,zoom:1,fit:'cover'}});
      setDraft(old=>({...old,background:'image',backgroundImage:result.image.src}));
    }catch(cause){setError(cause.message);}finally{setBusy(false);}
  }
  useEffect(()=>{dialog.current.showModal();},[]);
  useEffect(()=>{preview({key,value:draft}); return ()=>preview(null);},[key,draft,preview]);
  async function save(undo=false) {
    setBusy(true);setError('');
    try {
      const pending=Object.entries({...drafts.current,[key]:draft}).filter(([itemKey,value])=>changed(itemKey,value));
      if(!undo && (pending.length>1 || pending[0]?.[0]!==key)){
        const result=await api('/site-content/batch',{method:'POST',body:{changes:pending.map(([itemKey,value])=>({key:itemKey,value,expectedRevision:entries[itemKey]?.revision || 0}))}});
        Object.entries(result.entries).forEach(([itemKey,entry])=>publish(itemKey,entry));drafts.current={};close();
      }else{
        const result=await api(`/site-content/${key}`,{method:'PUT',body:{expectedRevision:baseline.revision,...(undo?{undo:true}:{value:draft})}});
        publish(key,result.entry);delete drafts.current[key];setDraft(result.entry?.value || {});if (!otherDirty) close();
      }
    }
    catch(e){setError(e.message);} finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="site-content-dialog" data-site-image-ignore="" aria-label="Edit website section" onCancel={event=>{event.preventDefault();if(!busy)requestClose();}}>
    <form onSubmit={event=>{event.preventDefault();save();}}><div className="site-content-heading"><h2>Edit website</h2><button type="button" disabled={busy} onClick={requestClose} aria-label="Close website editor">×</button></div>
      <p>Press and hold any text, program, photo or section to edit it. Changes preview here; Publish saves every part changed in this draft.</p><p className="editor-save-state" role="status">{busy ? "Saving your changes…" : dirty ? "Unpublished changes" : "Matches the published version"}</p>
      <fieldset disabled={busy}>{record && <button type="button" onClick={()=>{if(requestClose())editRecord(record);}}>{record.kind === 'trainer' ? 'Edit trainer name & profile' : 'Edit program name & prices'}</button>}<label>Edit this part<select aria-label="Edit this part" value={key} onChange={event=>{drafts.current[key] = draft;setKey(event.target.value);setDraft(drafts.current[event.target.value] || entries[event.target.value]?.value || {});setError('');}}>{options.map(item=><option key={item.key} value={item.key}>{item.title}</option>)}</select></label>
      {selected.media?.map(item=><button type="button" key={item.key} onClick={()=>{if (!requestClose()) return;window.dispatchEvent(new CustomEvent('bravo-edit-photo',{detail:{key:item.key}}));}}>Edit photo/video: {item.title}</button>)}
      {selected.text && <label>Text<textarea aria-label="Text" rows={5} maxLength={8000} value={draft.text ?? selected.original} onChange={event=>change('text',event.target.value)}/></label>}
      {selected.link && <label>Link address<input type="text" maxLength={1000} value={draft.link ?? selected.link} onChange={event=>change('link',event.target.value)}/></label>}
      {!selected.text && key!=='site-theme' && <p>This area contains live information or other elements. Choose a text item to edit its words.</p>}
      <div className="site-content-fields"><label>Font<select aria-label="Font" value={draft.font || ''} onChange={event=>setDraft(({font,...old})=>event.target.value?{...old,font:event.target.value}:old)}><option value="">Original font</option>{Object.keys(CONTENT_FONTS).map(font=><option key={font} value={font}>{font}</option>)}</select></label>
      <label>Text size (12–100 px)<input type="number" min="12" max="100" value={draft.fontSize ?? ''} placeholder="Original" onChange={event=>setDraft(({fontSize,...old})=>event.target.value?{...old,fontSize:Number(event.target.value)}:old)}/></label>
      <label>Text color<input aria-label="Text color" type="color" value={draft.color || '#ba9a64'} onChange={event=>change('color',event.target.value)}/></label>
      <label>Text alignment<select aria-label="Text alignment" value={draft.textAlign || ''} onChange={event=>setDraft(({textAlign,...old})=>event.target.value?{...old,textAlign:event.target.value}:old)}><option value="">Original</option><option>left</option><option>center</option><option>right</option></select></label>
      <label>Background<select aria-label="Background" value={draft.background || ''} onChange={event=>setDraft(({background,...old})=>event.target.value?{...old,background:event.target.value}:old)}><option value="">Original background</option><option value="solid">Solid color</option><option value="gradient">Gradient</option><option value="image">Photo</option><option value="transparent">Transparent</option></select></label>
      {draft.background==='image' && <><label>Background photo<input type="file" accept="image/*" onChange={event=>uploadBackground(event.target.files?.[0])}/></label>{draft.backgroundImage && <img className="content-background-preview" src={draft.backgroundImage} alt="Selected section background"/>}<label>Photo darkness<input type="range" min="0" max="1" step=".05" value={draft.backgroundShade ?? .35} onChange={event=>change('backgroundShade',Number(event.target.value))}/></label>{[['backgroundX','Photo left / right'],['backgroundY','Photo up / down']].map(([field,label])=><label key={field}>{label}<input type="range" min="0" max="100" value={draft[field] ?? 50} onChange={event=>change(field,Number(event.target.value))}/></label>)}</>}
      {['solid','gradient'].includes(draft.background) && <label>Background color<input type="color" value={draft.backgroundColor || '#101010'} onChange={event=>change('backgroundColor',event.target.value)}/></label>}
      {draft.background==='gradient' && <><label>Gradient end color<input type="color" value={draft.gradientEnd || '#ba9a64'} onChange={event=>change('gradientEnd',event.target.value)}/></label><label>Gradient angle: {draft.angle ?? 90}°<input type="range" min="0" max="360" value={draft.angle ?? 90} onChange={event=>change('angle',Number(event.target.value))}/></label></>}
      <label>Top/bottom spacing (px)<input type="number" min="0" max="160" value={draft.paddingY ?? ''} placeholder="Original" onChange={event=>setDraft(({paddingY,...old})=>event.target.value?{...old,paddingY:Number(event.target.value)}:old)}/></label>
      <label>Opacity: {draft.opacity ?? 1}<input type="range" min="0.1" max="1" step="0.05" value={draft.opacity ?? 1} onChange={event=>change('opacity',Number(event.target.value))}/></label></div>
      <button type="button" onClick={()=>setDraft({})}>Reset this part to original</button>
      {baseline.canUndo && <button type="button" onClick={()=>save(true)}>Restore previous published edit</button>}
      </fieldset>{error && <p role="alert">{error}</p>}<div className="site-content-actions"><button type="button" disabled={busy} onClick={requestClose}>Cancel</button><button type="submit" disabled={busy || !dirty}>{busy?'Publishing…':'Publish website changes'}</button></div>
    </form>
  </dialog>;
}
