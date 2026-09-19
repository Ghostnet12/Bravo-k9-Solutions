import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { isImageEditor } from '../../shared/site-images.js';
import { CONTENT_FONTS, contentStyle, themeCss } from '../../shared/site-content.js';
import './site-content.css';
const Content = createContext({ entries:{} });
const flatten = children => (Array.isArray(children) ? children : [children]).map(child => typeof child === 'string' || typeof child === 'number' ? child : child?.type === 'br' ? '\n' : child?.props ? flatten(child.props.children) : '').join('');
export function Editable({ as:Tag='div', contentKey, canEditText=false, canEditLink=false, children, style, ...props }) {
  const { entries, preview } = useContext(Content);
  const value = preview?.key === contentKey ? preview.value : entries[contentKey]?.value || {};
  const linkProperty = props.to !== undefined ? 'to' : 'href';
  return <Tag {...props} {...(value.link ? {[linkProperty]:value.link} : {})} data-site-original-link={canEditLink && typeof props[linkProperty]==='string' ? props[linkProperty] : undefined} data-site-custom-font={value.font || undefined} data-site-content-key={contentKey} data-site-content-text={canEditText || undefined} data-site-original-text={canEditText ? flatten(children) : undefined} style={{ ...style, ...contentStyle(value), ...(value.text !== undefined ? {whiteSpace:'pre-line'} : {}) }}>{canEditText && value.text !== undefined ? value.text : children}</Tag>;
}
function ContentEditor({ options, entries, publish, close, preview }) {
  const dialog=useRef(null);
  const [key,setKey]=useState(options[0].key), [draft,setDraft]=useState(entries[options[0].key]?.value || {}), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const selected=options.find(item=>item.key===key), baseline=entries[key] || {revision:0,value:{}};
  const change=(name,value)=>setDraft(old=>({...old,[name]:value}));
  useEffect(()=>{dialog.current.showModal();},[]);
  useEffect(()=>{preview({key,value:draft}); return ()=>preview(null);},[key,draft,preview]);
  async function save(undo=false) {
    setBusy(true);setError('');
    try { const result=await api(`/site-content/${key}`,{method:'PUT',body:{expectedRevision:baseline.revision,...(undo?{undo:true}:{value:draft})}});publish(key,result.entry);close(); }
    catch(e){setError(e.message);} finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="site-content-dialog" data-site-image-ignore="" aria-label="Edit website section" onCancel={event=>{event.preventDefault();if(!busy)close();}}>
    <form onSubmit={event=>{event.preventDefault();save();}}><div className="site-content-heading"><h2>Edit website</h2><button type="button" disabled={busy} onClick={close} aria-label="Close website editor">×</button></div>
      <p>Changes preview on this page. Publish to make them visible to everyone.</p>
      <fieldset disabled={busy}><label>Edit this part<select aria-label="Edit this part" value={key} onChange={event=>{setKey(event.target.value);setDraft(entries[event.target.value]?.value || {});setError('');}}>{options.map(item=><option key={item.key} value={item.key}>{item.title}</option>)}</select></label>
      {selected.media?.map(item=><button type="button" key={item.key} onClick={()=>{close();window.dispatchEvent(new CustomEvent('bravo-edit-photo',{detail:{key:item.key}}));}}>Edit photo/video: {item.title}</button>)}
      {selected.text && <label>Text<textarea aria-label="Text" rows={5} maxLength={8000} value={draft.text ?? selected.original} onChange={event=>change('text',event.target.value)}/></label>}
      {selected.link && <label>Link address<input type="text" maxLength={1000} value={draft.link ?? selected.link} onChange={event=>change('link',event.target.value)}/></label>}
      {!selected.text && key!=='site-theme' && <p>This area contains live information or other elements. Choose a text item to edit its words.</p>}
      <div className="site-content-fields"><label>Font<select aria-label="Font" value={draft.font || ''} onChange={event=>setDraft(({font,...old})=>event.target.value?{...old,font:event.target.value}:old)}><option value="">Original font</option>{Object.keys(CONTENT_FONTS).map(font=><option key={font} value={font}>{font}</option>)}</select></label>
      <label>Text size (12–100 px)<input type="number" min="12" max="100" value={draft.fontSize ?? ''} placeholder="Original" onChange={event=>setDraft(({fontSize,...old})=>event.target.value?{...old,fontSize:Number(event.target.value)}:old)}/></label>
      <label>Text color<input type="color" value={draft.color || '#ba9a64'} onChange={event=>change('color',event.target.value)}/></label>
      <label>Text alignment<select aria-label="Text alignment" value={draft.textAlign || ''} onChange={event=>setDraft(({textAlign,...old})=>event.target.value?{...old,textAlign:event.target.value}:old)}><option value="">Original</option><option>left</option><option>center</option><option>right</option></select></label>
      <label>Background<select aria-label="Background" value={draft.background || ''} onChange={event=>setDraft(({background,...old})=>event.target.value?{...old,background:event.target.value}:old)}><option value="">Original background</option><option value="solid">Solid color</option><option value="gradient">Gradient</option><option value="transparent">Transparent</option></select></label>
      {['solid','gradient'].includes(draft.background) && <label>Background color<input type="color" value={draft.backgroundColor || '#101010'} onChange={event=>change('backgroundColor',event.target.value)}/></label>}
      {draft.background==='gradient' && <><label>Gradient end color<input type="color" value={draft.gradientEnd || '#ba9a64'} onChange={event=>change('gradientEnd',event.target.value)}/></label><label>Gradient angle: {draft.angle ?? 90}°<input type="range" min="0" max="360" value={draft.angle ?? 90} onChange={event=>change('angle',Number(event.target.value))}/></label></>}
      <label>Top/bottom spacing (px)<input type="number" min="0" max="160" value={draft.paddingY ?? ''} placeholder="Original" onChange={event=>setDraft(({paddingY,...old})=>event.target.value?{...old,paddingY:Number(event.target.value)}:old)}/></label>
      <label>Opacity: {draft.opacity ?? 1}<input type="range" min="0.1" max="1" step="0.05" value={draft.opacity ?? 1} onChange={event=>change('opacity',Number(event.target.value))}/></label></div>
      <button type="button" onClick={()=>setDraft({})}>Reset this part to original</button>
      {baseline.canUndo && <button type="button" onClick={()=>save(true)}>Restore previous published edit</button>}
      </fieldset>{error && <p role="alert">{error}</p>}<div className="site-content-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="submit" disabled={busy || JSON.stringify(draft)===JSON.stringify(baseline.value)}>{busy?'Publishing…':'Publish website changes'}</button></div>
    </form>
  </dialog>;
}
function initialEntries() { try{return typeof document==='undefined'?{}:JSON.parse(document.querySelector('meta[name="bravo-site-content"]')?.content || '{}');}catch{return {};}}
export function SiteContentProvider({ children }) {
  const {user}=useBravo(), {pathname}=useLocation(), canEdit=isImageEditor(user) && !user?.mustChangePassword;
  useEffect(()=>{document.getElementById('bravo-published-theme')?.remove();},[]);
  const [entries,setEntries]=useState(initialEntries), [selection,setSelection]=useState(null), [preview,setPreview]=useState(null), [error,setError]=useState('');
  const allowed=useRef(canEdit);allowed.current=canEdit;
  useEffect(()=>{let live=true;api('/site-content').then(data=>{if(live)setEntries(data.entries || {});}).catch(()=>{});return()=>{live=false;};},[pathname]);
  useEffect(()=>{setSelection(null);setPreview(null);},[pathname,canEdit]);
  useEffect(()=>{
    if(!canEdit)return;
    let hold=null, suppressUntil=0, pending=false, disposed=false;
    const cancel=()=>{clearTimeout(hold?.timer);hold=null;};
    const ignored=target=>target.closest('dialog,[data-site-image-editor],.home-status-banner,.home-work-proof,input,textarea,select,[data-site-image-editable]');
    async function open(target){
      if(pending || !allowed.current)return;pending=true;cancel();setError('');
      const options=[];
      for(let node=target.closest('[data-site-content-key]');node;node=node.parentElement?.closest('[data-site-content-key]')){
        if(options.some(x=>x.key===node.dataset.siteContentKey))continue;
        options.push({key:node.dataset.siteContentKey,media:[...node.querySelectorAll('[data-site-image-key]')].filter(image=>!image.closest('[data-site-image-ignore]')).map(image=>({key:image.dataset.siteImageKey,title:image.getAttribute('alt') || 'Section media'})),text:node.dataset.siteContentText==='true',link:node.dataset.siteOriginalLink,original:node.dataset.siteOriginalText || '',title:`${node.tagName.toLowerCase()}: ${(node.dataset.siteOriginalText || node.getAttribute('aria-label') || node.className || 'section').replace(/\s+/g,' ').slice(0,65)}`});
      }
      for (const node of target.querySelectorAll('[data-site-content-key]')) { if(options.some(item=>item.key===node.dataset.siteContentKey))continue; options.push({key:node.dataset.siteContentKey,media:[...node.querySelectorAll('[data-site-image-key]')].filter(image=>!image.closest('[data-site-image-ignore]')).map(image=>({key:image.dataset.siteImageKey,title:image.getAttribute('alt') || 'Section media'})),text:node.dataset.siteContentText==='true',link:node.dataset.siteOriginalLink,original:node.dataset.siteOriginalText || '',title:`${node.tagName.toLowerCase()}: ${(node.dataset.siteOriginalText || node.className || 'section').replace(/\s+/g,' ').slice(0,65)}`}); }
      options.push({key:'site-theme',text:false,title:'Whole website · fonts, colors & background'});
      try{const fresh=await api('/site-content');if(!disposed && allowed.current){setEntries(fresh.entries || {});setSelection(options);}}
      catch(e){if(!disposed)setError(e.message);}finally{pending=false;}
    }
    const down=event=>{cancel();const target=event.target;if(!(target instanceof Element)||event.button!==0||event.isPrimary===false||ignored(target)||!target.closest('[data-site-content-key]'))return;hold={x:event.clientX,y:event.clientY,timer:setTimeout(()=>{suppressUntil=Date.now()+1200;open(target);},650)};};
    const move=event=>{if(hold && Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>12)cancel();};
    const click=event=>{if(Date.now()<suppressUntil && !event.target.closest?.('dialog')){event.preventDefault();event.stopPropagation();}};
    const context=event=>{if(event.target instanceof Element && !ignored(event.target) && event.target.closest('[data-site-content-key]'))event.preventDefault();};
    const requested=event=>{const key=event.detail?.key;if(typeof key!=='string'||!/^[-a-z0-9]+$/.test(key))return;const target=document.querySelector(`[data-site-content-key="${key}"]`);if(target)open(target);};
    const keyboard=event=>{if(event.altKey && event.key.toLowerCase()==='e' && !document.querySelector('dialog[open]')){const target=document.activeElement?.closest('[data-site-content-key]') || document.querySelector('main[data-site-content-key]');if(target){event.preventDefault();open(target);}}};
    window.addEventListener('keydown',keyboard);window.addEventListener('bravo-content-edit',requested);
    document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true);document.addEventListener('click',click,true);document.addEventListener('contextmenu',context,true);
    for(const type of ['pointerup','pointercancel','scroll'])document.addEventListener(type,cancel,true);
    window.addEventListener('blur',cancel);
    document.documentElement.classList.add('site-content-owner');
    return()=>{disposed=true;cancel();window.removeEventListener('keydown',keyboard);window.removeEventListener('bravo-content-edit',requested);document.documentElement.classList.remove('site-content-owner');document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('click',click,true);document.removeEventListener('contextmenu',context,true);for(const type of ['pointerup','pointercancel','scroll'])document.removeEventListener(type,cancel,true);window.removeEventListener('blur',cancel);};
  },[canEdit]);
  const theme=preview?.key==='site-theme'?preview.value:entries['site-theme']?.value;
  return <Content.Provider value={{entries,preview}}><style>{themeCss(theme)}</style>{children}{canEdit && error && <p role="alert">{error}</p>}{canEdit && selection && <ContentEditor options={selection} entries={entries} preview={setPreview} close={()=>{setSelection(null);setPreview(null);}} publish={(key,entry)=>setEntries(old=>({...old,[key]:entry}))}/>}</Content.Provider>;
}
