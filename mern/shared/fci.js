export const FCI_HOME = 'https://www.fci.be/en/';
export const FCI_REFRESH_MS = 86400000;
export function officialFCIUrl(value) {
  try {
    const url = new URL(value, FCI_HOME);
    if (url.protocol !== 'https:' || !['www.fci.be', 'fci.be'].includes(url.hostname) || url.port || url.username || url.password) return null;
    if (!url.pathname.startsWith('/en/') || !/\.html$/.test(url.pathname)) return null;
    url.hash = ''; url.search = '';
    url.hostname = 'www.fci.be';
    return url.href;
  } catch { return null; }
}
export function cleanFCIItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap(item => {
    const url = officialFCIUrl(item?.url);
    const title = typeof item?.title === 'string' ? item.title.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 180) : '';
    if (!url || !title || seen.has(url)) return [];
    seen.add(url);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') && !Number.isNaN(Date.parse(item.date)) ? item.date : null;
    return [{ url, title, date }];
  }).slice(0, 12);
}
