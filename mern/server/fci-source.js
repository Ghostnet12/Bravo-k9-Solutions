import { parse } from 'parse5';
import { FCI_HOME, cleanFCIItems } from '../shared/fci.js';
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value || '';
const text = node => ['script', 'style', 'template'].includes(node.nodeName) ? '' : node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join(' ');
function descendants(node) { return [node, ...(node.childNodes || []).flatMap(descendants)]; }
function dateISO(raw) {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, m, d, y] = match;
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}
// Only dated entries in the official announcements repeater, never navigation.
export function parseFCIAnnouncements(html) {
  const items = descendants(parse(html)).filter(n => n.nodeName === 'a' && /^ContentPlaceHolder1_ActualitesRepeater_HyperLink1_\d+$/.test(attr(n, 'id'))).map(node => {
    const nodes = descendants(node);
    const title = text(nodes.find(n => attr(n, 'class').split(/\s+/).includes('titre')) || {}).replace(/\s+/g, ' ').trim();
    const date = dateISO(text(nodes.find(n => attr(n, 'class').split(/\s+/).includes('date')) || {}));
    return { title, date, url: attr(node, 'href') };
  });
  return cleanFCIItems(items).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
export async function fetchFCIAnnouncements(fetcher = fetch) {
  // No caller-supplied URL, no redirects, no cookies, no third-party media.
  const response = await fetcher(FCI_HOME, { redirect: 'error', headers: { Accept: 'text/html', 'User-Agent': 'BravoK9-FCI-Updates/1.0 (+https://bravounleashed.com/fci-support)' }, signal: AbortSignal.timeout(8000) });
  if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error('FCI source unavailable');
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 1000000) throw new Error('FCI source exceeds limit');
    chunks.push(Buffer.from(chunk));
  }
  const items = parseFCIAnnouncements(Buffer.concat(chunks).toString('utf8'));
  if (!items.length) throw new Error('FCI announcement structure unavailable');
  return items;
}
