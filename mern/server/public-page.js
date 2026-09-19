import { readFile } from 'node:fs/promises';
import { renderSiteContent } from './content-html.js';
import { loadSiteContent } from './site-content.js';
const pages=new Set(['dog-training','behavior-assessment','dog-walking','learn','contact','accessibility','media-rights']);
export async function publicPageHandler(req,res) {
  const path=String(req.query?.path || '').replace(/^\//,'');
  if(!pages.has(path))return res.status(404).end();
  const [html,entries]=await Promise.all([readFile(new URL(`../client/dist/${path}.html`,import.meta.url),'utf8'),loadSiteContent().catch(()=>({}))]);
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.statusCode=200;res.end(renderSiteContent(html,entries));
}
