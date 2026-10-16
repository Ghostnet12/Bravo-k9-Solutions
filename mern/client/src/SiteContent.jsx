import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { isImageEditor } from '../../shared/site-images.js';
import { contentStyle, themeCss } from '../../shared/site-content.js';
import './site-content.css';
const ContentEditor = lazy(() => import('./ContentEditor'));
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
      try{const fresh=await api('/site-content', { foreground: true });if(!disposed && allowed.current && route.current===openedRoute && target.isConnected){setEntries(fresh.entries || {});setSelection(options);}}
      catch(e){if(!disposed)setError(e.message);}finally{pending=false;}
    }
    const down=event=>{cancel();suppressUntil=0;const target=event.target;if(!(target instanceof Element)||event.button!==0||event.isPrimary===false||ignored(target)||!target.closest('main,header,footer,[data-site-content-key],[data-site-service],[data-site-trainer]'))return;hold={x:event.clientX,y:event.clientY,timer:setTimeout(()=>{suppressUntil=Date.now()+1200;open(target);},650)};};
    const move=event=>{if(hold && Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>12){suppressUntil=Date.now()+1200;cancel();}};
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
  return <Content.Provider value={{entries,preview,publishEntry:(key,entry)=>setEntries(old=>({...old,[key]:entry}))}}><style>{themeCss(theme)}</style>{children}{canEdit && <button type="button" className="content-edit-launcher" onClick={() => window.dispatchEvent(new CustomEvent('bravo-content-edit', { detail: { key: 'page' } }))}>Edit page text &amp; design</button>}{canEdit && status && <p className="content-save-status" role="status">{status}</p>}{canEdit && error && <p role="alert">{error}</p>}{canEdit && selection && <Suspense fallback={<p className="content-save-status" role="status">Opening editor…</p>}><ContentEditor record={record} editRecord={setEditingRecord} options={selection} entries={entries} preview={setPreview} close={()=>{setSelection(null);setPreview(null);}} publish={(key,entry)=>{setEntries(old=>({...old,[key]:entry}));setStatus('Saved. Your website changes are published.');}}/></Suspense>}{canEdit && editingRecord && <Suspense fallback={<p className="content-save-status" role="status">Opening editor…</p>}><WebsiteRecordEditor key={`${editingRecord.kind}-${editingRecord.id}`} record={editingRecord} close={()=>setEditingRecord(null)} published={setStatus} design={()=>{
      const target=editingRecord.styleKey ? document.querySelector(`[data-site-content-key="${editingRecord.styleKey}"]`) : document.querySelector(`[data-site-${editingRecord.kind==='trainer'?'trainer':'service'}="${editingRecord.id}"]`)?.closest('[data-site-content-key]');
      setEditingRecord(null);if(target)window.dispatchEvent(new CustomEvent('bravo-content-edit',{detail:{key:target.dataset.siteContentKey,design:true}}));
    }}/></Suspense>}</Content.Provider>;
}
