import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { isImageEditor } from '../../shared/site-images.js';
import { CONTENT_FONTS, contentStyle, themeCss } from '../../shared/site-content.js';
import './site-content.css';
const WebsiteRecordEditor = lazy(() => import('./WebsiteRecordEditor'));
const Content = createContext({ entries:{} });
export const useSiteContent = () => useContext(Content);
const flatten = children => (Array.isArray(children) ? children : [children]).map(child => typeof child === 'string' || typeof child === 'number' ? child : child?.type === 'br' ? '\n' : child?.props ? flatten(child.props.children) : '').join('');
export function Editable({ as:Tag='div', contentKey, canEditText=false, canEditLink=false, children, style, ...props }) {
  const { entries, preview } = useContext(Content);
  const value = preview?.key === contentKey ? preview.value : entries[contentKey]?.value || {};
  const linkProperty = props.to !== undefined ? 'to' : 'href';
  return <Tag {...props} {...(value.link ? {[linkProperty]:value.link} : {})} data-site-original-link={canEditLink && typeof props[linkProperty]==='string' ? props[linkProperty] : undefined} data-site-custom-font={value.font || undefined} data-site-custom-color={value.color || undefined} data-site-content-key={contentKey} data-site-content-text={canEditText || undefined} data-site-original-text={canEditText ? flatten(children) : undefined} style={{ ...style, ...contentStyle(value), ...(value.text !== undefined ? {whiteSpace:'pre-line'} : {}) }}>{canEditText && value.text !== undefined ? value.text : children}</Tag>;
}
function ContentEditor({ options, entries, publish, close, preview, record, editRecord }) {
  const dialog=useRef(null);
  const [key,setKey]=useState(options[0].key), [draft,setDraft]=useState(entries[options[0].key]?.value || {}), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const drafts=useRef({});
  const selected=options.find(item=>item.key===key), baseline=entries[key] || {revision:0,value:{}};
  const changed = (itemKey, value) => JSON.stringify(value) !== JSON.stringify(entries[itemKey]?.value || {});
  const otherDirty = Object.entries(drafts.current).some(([itemKey, value]) => itemKey !== key && changed(itemKey, value));
  const dirty = changed(key, draft) || otherDirty;
  const requestClose = () => { if (busy || (dirty && !window.confirm('Discard your unpublished changes?'))) return false; close(); return true; };
  useEffect(() => { const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
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
function initialEntries() { try{return typeof document==='undefined'?{}:JSON.parse(document.querySelector('meta[name="bravo-site-content"]')?.content || '{}');}catch{return {};}}
export function SiteContentProvider({ children }) {
  const {user}=useBravo(), {pathname}=useLocation(), canEdit=isImageEditor(user) && !user?.mustChangePassword;
  useEffect(()=>{document.getElementById('bravo-published-theme')?.remove();},[]);
  const [entries,setEntries]=useState(initialEntries), [selection,setSelection]=useState(null), [record,setRecord]=useState(null), [editingRecord,setEditingRecord]=useState(null), [preview,setPreview]=useState(null), [error,setError]=useState(''), [status,setStatus]=useState('');
  useEffect(() => { if (!status) return; const timer = setTimeout(() => setStatus(''), 7000); return () => clearTimeout(timer); }, [status]);
  const allowed=useRef(canEdit);allowed.current=canEdit;const route=useRef(pathname);route.current=pathname;
  useEffect(()=>{let live=true;api('/site-content').then(data=>{if(live)setEntries(data.entries || {});}).catch(()=>{});return()=>{live=false;};},[pathname]);
  useEffect(()=>{setSelection(null);setPreview(null);setEditingRecord(null);setRecord(null);},[pathname,canEdit]);
  useEffect(()=>{let live=true;const refresh=()=>api('/site-content').then(data=>{if(live)setEntries(data.entries || {});}).catch(()=>{});window.addEventListener('bravo-team-published',refresh);return()=>{live=false;window.removeEventListener('bravo-team-published',refresh);};},[]);
  useEffect(()=>{
    if(!canEdit)return;
    let hold=null, suppressUntil=0, pending=false, disposed=false;
    const cancel=()=>{clearTimeout(hold?.timer);hold=null;};
    const ignored=target=>(target.closest('.home-hero') && !target.closest('.home-hero').contains(target.closest('[data-site-content-key]'))) || target.closest('dialog,[data-site-image-editor],.home-status-banner,.home-ad-carousel,.home-work-proof,.home-hero-gallery,.cinema-hero-media,.cinema-film-edit,input,textarea,select,[data-site-image-editable],[data-site-image-editor]');
    async function open(target,design=false){
      if(pending || !allowed.current)return;const openedRoute=route.current;pending=true;cancel();setError('');
      if(target.closest('[data-site-workshop]')){window.dispatchEvent(new CustomEvent('bravo-workshop-edit'));pending=false;return;}
      const entity=target.closest('[data-site-trainer],[data-site-service]');
      const currentRecord=entity ? entity.dataset.siteTrainer ? {kind:'trainer',id:entity.dataset.siteTrainer} : {kind:'service',id:entity.dataset.siteService} : null;
      if(currentRecord)currentRecord.styleKey=entity.closest('[data-site-content-key]')?.dataset.siteContentKey;
      setRecord(currentRecord);
      if(currentRecord && !design && !target.closest('[data-site-content-text=true]')) { setEditingRecord(currentRecord); pending=false; return; }
      if(target.closest('[data-site-program]') && !target.closest('[data-site-program]').contains(target.closest('[data-site-content-key]'))) { window.dispatchEvent(new CustomEvent('bravo-program-edit',{detail:{id:target.closest('[data-site-program]').dataset.siteProgram}})); pending=false; return; }
      const options=[];
      for(let node=target.closest('[data-site-content-key]');node;node=node.parentElement?.closest('[data-site-content-key]')){
        if(options.some(x=>x.key===node.dataset.siteContentKey))continue;
        options.push({key:node.dataset.siteContentKey,media:[...node.querySelectorAll('[data-site-image-key]')].filter(image=>!image.closest('[data-site-image-ignore]')).map(image=>({key:image.dataset.siteImageKey,title:image.getAttribute('alt') || 'Section media'})),text:node.dataset.siteContentText==='true',link:node.dataset.siteOriginalLink,original:node.dataset.siteOriginalText || '',title:`${node.tagName.toLowerCase()}: ${(node.dataset.siteOriginalText || node.getAttribute('aria-label') || node.className || 'section').replace(/\s+/g,' ').slice(0,65)}`});
      }
      for (const node of target.querySelectorAll('[data-site-content-key]')) { if(options.some(item=>item.key===node.dataset.siteContentKey))continue; options.push({key:node.dataset.siteContentKey,media:[...node.querySelectorAll('[data-site-image-key]')].filter(image=>!image.closest('[data-site-image-ignore]')).map(image=>({key:image.dataset.siteImageKey,title:image.getAttribute('alt') || 'Section media'})),text:node.dataset.siteContentText==='true',link:node.dataset.siteOriginalLink,original:node.dataset.siteOriginalText || '',title:`${node.tagName.toLowerCase()}: ${(node.dataset.siteOriginalText || node.className || 'section').replace(/\s+/g,' ').slice(0,65)}`}); }
      options.push({key:'site-theme',text:false,title:'Whole website · fonts, colors & background'});
      try{const fresh=await api('/site-content');if(!disposed && allowed.current && route.current===openedRoute && target.isConnected){setEntries(fresh.entries || {});setSelection(options);}}
      catch(e){if(!disposed)setError(e.message);}finally{pending=false;}
    }
    const down=event=>{cancel();suppressUntil=0;const target=event.target;if(!(target instanceof Element)||event.button!==0||event.isPrimary===false||ignored(target)||!target.closest('main,header,footer,[data-site-content-key],[data-site-service],[data-site-trainer]'))return;hold={x:event.clientX,y:event.clientY,timer:setTimeout(()=>{suppressUntil=Date.now()+1200;open(target);},650)};};
    const move=event=>{if(hold && Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>12)cancel();};
    const click=event=>{if(Date.now()<suppressUntil && !event.target.closest?.('dialog')){event.preventDefault();event.stopPropagation();}};
    const context=event=>{if(event.target instanceof Element && !ignored(event.target) && event.target.closest('main,header,footer,[data-site-content-key],[data-site-service],[data-site-trainer]'))event.preventDefault();};
    const requested=event=>{if(event.detail?.record){const {kind,id}=event.detail.record;if(['trainer','service'].includes(kind) && /^[-a-z0-9]+$/.test(id)){setSelection(null);setEditingRecord({kind,id});}return;}const key=event.detail?.key;if(typeof key!=='string'||!/^[-a-z0-9]+$/.test(key))return;const target=key === 'page' ? document.getElementById('root') : document.querySelector(`[data-site-content-key="${key}"]`);if(target)open(target,!!event.detail?.design);};
    const keyboard=event=>{if(event.altKey && event.key.toLowerCase()==='e' && !document.querySelector('dialog[open]')){const target=document.activeElement?.closest('[data-site-content-key],[data-site-service],[data-site-trainer]') || document.querySelector('main');if(target){event.preventDefault();open(target);}}};
    window.addEventListener('keydown',keyboard);window.addEventListener('bravo-content-edit',requested);
    document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true);document.addEventListener('click',click,true);document.addEventListener('contextmenu',context,true);
    for(const type of ['pointerup','pointercancel','scroll'])document.addEventListener(type,cancel,true);
    window.addEventListener('blur',cancel);
    document.documentElement.classList.add('site-content-owner');
    return()=>{disposed=true;cancel();window.removeEventListener('keydown',keyboard);window.removeEventListener('bravo-content-edit',requested);document.documentElement.classList.remove('site-content-owner');document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('click',click,true);document.removeEventListener('contextmenu',context,true);for(const type of ['pointerup','pointercancel','scroll'])document.removeEventListener(type,cancel,true);window.removeEventListener('blur',cancel);};
  },[canEdit]);
  const theme=preview?.key==='site-theme'?preview.value:entries['site-theme']?.value;
  return <Content.Provider value={{entries,preview,publishEntry:(key,entry)=>setEntries(old=>({...old,[key]:entry}))}}><style>{themeCss(theme)}</style>{children}{canEdit && <button type="button" className="content-edit-launcher" onClick={() => window.dispatchEvent(new CustomEvent('bravo-content-edit', { detail: { key: 'page' } }))}>Edit page text &amp; design</button>}{canEdit && status && <p className="content-save-status" role="status">{status}</p>}{canEdit && error && <p role="alert">{error}</p>}{canEdit && selection && <ContentEditor record={record} editRecord={setEditingRecord} options={selection} entries={entries} preview={setPreview} close={()=>{setSelection(null);setPreview(null);}} publish={(key,entry)=>{setEntries(old=>({...old,[key]:entry}));setStatus('Saved. Your website changes are published.');}}/>}{canEdit && editingRecord && <Suspense fallback={<p className="content-save-status" role="status">Opening editor…</p>}><WebsiteRecordEditor key={`${editingRecord.kind}-${editingRecord.id}`} record={editingRecord} close={()=>setEditingRecord(null)} published={setStatus} design={()=>{
      const target=editingRecord.styleKey ? document.querySelector(`[data-site-content-key="${editingRecord.styleKey}"]`) : document.querySelector(`[data-site-${editingRecord.kind==='trainer'?'trainer':'service'}="${editingRecord.id}"]`)?.closest('[data-site-content-key]');
      setEditingRecord(null);if(target)window.dispatchEvent(new CustomEvent('bravo-content-edit',{detail:{key:target.dataset.siteContentKey,design:true}}));
    }}/></Suspense>}</Content.Provider>;
}
