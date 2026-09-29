import { recommendationMarkup, reviewHighlightMarkup } from '../shared/review-markup.js';
import { workshopMarkup } from '../shared/workshops.js';
import { parse, parseFragment, serialize } from 'parse5';
import { CONTENT_KEYS } from '../shared/site-content-keys.js';
import { styleString, themeCss } from '../shared/site-content.js';
import { publicCatalogSnapshot, money } from '../shared/catalog.js';
export function renderSiteContent(html, entries = {}, workshop, serviceCatalog, recommendations) {
  const catalog = publicCatalogSnapshot(serviceCatalog);
  const tree=parse(html);
  const attr=(node,name)=>node.attrs?.find(item=>item.name===name)?.value;
  const setAttr=(node,name,value)=>{node.attrs ||= [];const current=node.attrs.find(item=>item.name===name);if(current)current.value=value;else node.attrs.push({name,value});};
  function visit(node){
    for(const child of node.childNodes || [])visit(child);
    const service = catalog?.find(item => item.id === attr(node,'data-site-price'));
    const priceField = attr(node,'data-site-price-field');
    if(service && ['cents','additionalDogCents','bundleCents'].includes(priceField) && Number.isInteger(service[priceField])) node.childNodes=[{nodeName:'#text',value:money(service[priceField]),parentNode:node}];
    if (workshop !== undefined && attr(node,'data-workshop-content')) { node.childNodes = parseFragment(workshopMarkup(workshop, attr(node,'data-workshop-content') === 'compact')).childNodes; for (const child of node.childNodes) child.parentNode = node; }
    if (recommendations !== undefined && (attr(node, 'data-public-reviews') !== undefined || attr(node, 'data-review-highlight') !== undefined)) {
      node.childNodes = parseFragment(attr(node, 'data-public-reviews') !== undefined ? recommendationMarkup(recommendations) : reviewHighlightMarkup(recommendations)).childNodes;
      for (const child of node.childNodes) child.parentNode = node;
      if (recommendations.length && attr(node, 'data-public-reviews') !== undefined) setAttr(node, 'aria-labelledby', 'facebook-recommendations-title');
    }
    const key=attr(node,'data-site-content-key'), value=entries[key]?.value;
    if(value && Object.hasOwn(CONTENT_KEYS,key)){
      if(CONTENT_KEYS[key].link && value.link)setAttr(node,'href',value.link);
      if(value.font)setAttr(node,'data-site-custom-font',value.font);
      if(value.color)setAttr(node,'data-site-custom-color',value.color);
      const style=styleString(value);
      if(style)setAttr(node,'style',`${attr(node,'style') || ''};${style}`);
      if(CONTENT_KEYS[key].text && typeof value.text==='string'){
        node.childNodes=[{nodeName:'#text',value:value.text,parentNode:node}];
        setAttr(node,'style',`${attr(node,'style') || ''};white-space:pre-line`);
      }
    }
    if(node.tagName==='head'){
      if (recommendations !== undefined) node.childNodes.push({nodeName:'meta',tagName:'meta',namespaceURI:'http://www.w3.org/1999/xhtml',attrs:[{name:'name',value:'bravo-reviews'},{name:'content',value:JSON.stringify(recommendations).replaceAll('<','\\u003c')}],childNodes:[],parentNode:node});
      if(catalog) node.childNodes.push({nodeName:'meta',tagName:'meta',namespaceURI:'http://www.w3.org/1999/xhtml',attrs:[{name:'name',value:'bravo-catalog'},{name:'content',value:JSON.stringify(catalog).replaceAll('<','\\u003c')}],childNodes:[],parentNode:node});
      const snapshot={nodeName:'meta',tagName:'meta',namespaceURI:'http://www.w3.org/1999/xhtml',attrs:[{name:'name',value:'bravo-site-content'},{name:'content',value:JSON.stringify(entries).replaceAll('<','\\u003c')}],childNodes:[],parentNode:node};
      const style={nodeName:'style',tagName:'style',namespaceURI:'http://www.w3.org/1999/xhtml',attrs:[{name:'id',value:'bravo-published-theme'}],childNodes:[],parentNode:node};
      style.childNodes.push({nodeName:'#text',value:themeCss(entries['site-theme']?.value),parentNode:style});
      node.childNodes.push(snapshot,style);
      if (workshop !== undefined) node.childNodes.push({nodeName:'meta',tagName:'meta',namespaceURI:'http://www.w3.org/1999/xhtml',attrs:[{name:'name',value:'bravo-workshop'},{name:'content',value:JSON.stringify(workshop)}],childNodes:[],parentNode:node});
    }
  }
  visit(tree);return serialize(tree);
}
