import { loadPublicWorkshop } from './workshop-store.js';
import { readFile } from 'node:fs/promises';
import { renderSiteContent } from './content-html.js';
import { loadSiteContent } from './site-content-store.js';
import { connectDb } from './db.js';
import { effectiveServices } from './services.js';
export const publicPagePaths=['fci-support','live','workshops','dog-training','hunting-dog-training','behavior-assessment','dog-walking','learn','contact','accessibility','media-rights'].map(path=>'/' + path);
const pages=new Set(publicPagePaths.map(path=>path.slice(1)));
export function resolvePublicPagePath(requestUrl = '/') {
  try {
    const url = new URL(requestUrl, 'https://bravounleashed.com');
    const paths = url.searchParams.getAll('path');
    if (paths.length > 1) return null;
    const path = (paths[0] || url.pathname).replace(/^\//, '');
    return pages.has(path) ? path : null;
  } catch { return null; }
}
export async function publicPageHandler(req,res) {
  // Handle direct Express paths and Vercel rewrites without invoking a runtime's
  // legacy query/path getters. Only the fixed public-page allowlist reaches disk.
  const path=resolvePublicPagePath(req.url);
  if(!path)return res.status(404).end();
  const [html,entries,workshop,catalog]=await Promise.all([readFile(new URL(`../client/dist/${path}.html`,import.meta.url),'utf8'),loadSiteContent().catch(()=>({})),path === 'workshops' ? loadPublicWorkshop().catch(()=>null) : undefined,connectDb().then(()=>effectiveServices({includeDisabled:true,readOnly:true})).catch(()=>undefined)]);
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.statusCode=200;res.end(renderSiteContent(html,entries,workshop,catalog));
}

