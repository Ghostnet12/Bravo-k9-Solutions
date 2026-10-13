// Read-only, cached FCI announcement discovery. Never embed third-party scripts or HTML.
const FCI = 'https://www.fci.be';
const HOME = FCI + '/en/';
const decode = value => value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export default async function handler(req,res) {
 if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
 res.setHeader('Cache-Control','public, s-maxage=21600, stale-while-revalidate=86400');
 try {
  const response=await fetch(HOME,{headers:{Accept:'text/html'},signal:AbortSignal.timeout(6000)});
  if(!response.ok) throw new Error('Source unavailable');
  const html=(await response.text()).slice(0,900000);
  const items=[], seen=new Set();
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const match of html.matchAll(re)){
   const title=decode(match[2]);if(title.length<18||title.length>140)continue;
   let url;try{url=new URL(match[1],HOME)}catch{continue}
   if(!['fci.be','www.fci.be'].includes(url.hostname)||url.protocol!=='https:')continue;
   if(!/^\/(en|medias)\//.test(url.pathname)||!/-\d+\.html$/.test(url.pathname))continue;
   if(seen.has(url.href))continue;seen.add(url.href);
   items.push({title,url:url.href});
   if(items.length===8)break;
  }
  return res.status(200).json({items,source:HOME});
 }catch{return res.status(200).json({items:[],source:HOME,unavailable:true})}
}