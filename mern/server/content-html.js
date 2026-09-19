import { parse, serialize } from 'parse5';
import { CONTENT_KEYS } from '../shared/site-content-keys.js';
import { styleString, themeCss } from '../shared/site-content.js';
export function renderSiteContent(html, entries = {}) {
  const tree=parse(html);
  const attr=(node,name)=>node.attrs?.find(item=>item.name===name)?.value;
  const setAttr=(node,name,value)=>{node.attrs ||= [];const current=node.attrs.find(item=>item.name===name);if(current)current.value=value;else node.attrs.push({name,value});};
  function visit(node){
    for(const child of node.childNodes || [])visit(child);
    const key=attr(node,'data-site-content-key'), value=entries[key]?.value;
    if(value && Object.hasOwn(CONTENT_KEYS,key)){
      if(CONTENT_KEYS[key].link && value.link)setAttr(node,'href',value.link);
      if(value.font)setAttr(node,'data-site-custom-font',value.font);
      const style=styleString(value);
      if(style)setAttr(node,'style',`${attr(node,'style') || ''};${style}`);
      if(CONTENT_KEYS[key].text && typeof value.text==='string'){
        node.childNodes=[{nodeName:'#text',value:value.text,parentNode:node}];
        setAttr(node,'style',`${attr(node,'style') || ''};white-space:pre-line`);
      }
    }
    if(node.tagName==='head'){
      const snapshot={nodeName:'meta',tagName:'meta',namespaceURI:'http://www.w3.org/1999/xhtml',attrs:[{name:'name',value:'bravo-site-content'},{name:'content',value:JSON.stringify(entries)}],childNodes:[],parentNode:node};
      const style={nodeName:'style',tagName:'style',namespaceURI:'http://www.w3.org/1999/xhtml',attrs:[{name:'id',value:'bravo-published-theme'}],childNodes:[],parentNode:node};
      style.childNodes.push({nodeName:'#text',value:themeCss(entries['site-theme']?.value),parentNode:style});
      node.childNodes.push(snapshot,style);
    }
  }
  visit(tree);return serialize(tree);
}
