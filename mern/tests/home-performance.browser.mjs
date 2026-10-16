// Controlled lab comparison, not field Core Web Vitals or a Lighthouse score.
// Both revisions receive identical public fixtures and never contact MongoDB.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import express from 'express';
import { chromium } from 'playwright';
import { renderHomepage } from '../server/homepage.js';
import { SERVICES } from '../shared/catalog.js';
import { DEFAULT_REVIEWS } from '../shared/reviews.js';
import { DEFAULT_PROOF_VIDEOS } from '../shared/proof-videos.js';

const dist = path.resolve(process.env.PERF_DIST || 'client/dist');
const label = process.env.PERF_LABEL || 'candidate';
const html = renderHomepage(await readFile(path.join(dist, 'bravo-shell.html'), 'utf8'), null, null);
const app = express();
app.get('/api/config', (_req,res)=>res.json({connected:false,paymentsReady:false,services:SERVICES,schedule:{enabled:false,weekdays:[1,2,3,4,5],hours:[]}}));
app.get('/api/auth/me', (_req,res)=>res.json({user:null,services:[],membership:{active:false}}));
app.get('/api/team', (_req,res)=>res.json({team:[{id:'david',name:'David Northrop',profileKey:'david',role:'owner',title:'Owner & Lead Trainer'},{id:'ashley',name:'Ashley Leverock',profileKey:'ashley',role:'staff',title:'Trainer & Pitbull Specialist'}]}));
app.get('/api/reviews', (_req,res)=>res.json({reviews:[],count:0,recommendations:DEFAULT_REVIEWS}));
app.get('/api/proof-videos', (_req,res)=>res.json({clips:DEFAULT_PROOF_VIDEOS,nextCursor:null}));
app.get('/api/site-images', (_req,res)=>res.json({images:{}}));
app.get('/api/site-content', (_req,res)=>res.json({entries:{}}));
app.get('/api/team/schedules', (_req,res)=>res.json({schedules:[]}));
app.use('/api', (_req,res)=>res.json({sessions:[],events:[],clips:[],settings:{},ads:[],revision:0}));
// Match CDN text compression for both revisions, instead of measuring raw JS/CSS.
const compressed = new Map();
for (const directory of ['assets','fonts']) for (const file of await readdir(path.join(dist,directory))) {
  if (!/\.(js|css|ttf)$/.test(file)) continue;
  const type=file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'font/ttf';
  compressed.set(`/${directory}/${file}`,{type,body:gzipSync(await readFile(path.join(dist,directory,file)))});
}
app.use((req,res,next)=>{
  const asset=compressed.get(req.path);
  if (!asset || !req.acceptsEncodings('gzip')) return next();
  res.set('Content-Encoding','gzip').set('Vary','Accept-Encoding').type(asset.type).send(asset.body);
});
app.use(express.static(dist));
app.get('/{*path}', (req,res)=>{
  res.type('html');
  if(req.acceptsEncodings('gzip')) res.set('Content-Encoding','gzip').set('Vary','Accept-Encoding').send(gzipSync(html));
  else res.send(html);
});
const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
const results=[];
await mkdir('test-results',{recursive:true});
try {
  for(const width of [390,1440]) {
    for(let run=1;run<=3;run++) {
      const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'no-preference'});
      const page=await context.newPage();
      // Avoid third-party variability; site imagery, fonts and JS are served locally.
      await context.route('**/*',route=>route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const cdp=await context.newCDPSession(page);
      if(width===390) {
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
      }
      await page.addInitScript(()=>{
        window.labVitals={lcp:0,cls:0,maxInteraction:0,longTaskMs:0};
        let sessionStart=0,lastShift=0,sessionValue=0;
        new PerformanceObserver(list=>{for(const e of list.getEntries()) { window.labVitals.lcp=e.startTime; window.labVitals.lcpElement=e.element?.className || e.element?.tagName; }}).observe({type:'largest-contentful-paint',buffered:true});
        new PerformanceObserver(list=>{for(const e of list.getEntries()) {
          if(e.hadRecentInput) continue;
          if(e.startTime-lastShift>1000 || e.startTime-sessionStart>5000) {sessionStart=e.startTime;sessionValue=0;}
          sessionValue+=e.value;lastShift=e.startTime;window.labVitals.cls=Math.max(window.labVitals.cls,sessionValue);
        }}).observe({type:'layout-shift',buffered:true});
        new PerformanceObserver(list=>{for(const e of list.getEntries()) if(e.interactionId) window.labVitals.maxInteraction=Math.max(window.labVitals.maxInteraction,e.duration);}).observe({type:'event',buffered:true,durationThreshold:16});
        new PerformanceObserver(list=>{for(const e of list.getEntries()) window.labVitals.longTaskMs+=Math.max(0,e.duration-50);}).observe({type:'longtask',buffered:true});
      });
      await page.goto(origin,{waitUntil:'networkidle'});
      await page.locator('.cinema-hero-still').evaluate(img=>img.decode());
      await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,1000)));
      const initial=await page.evaluate(()=>({...window.labVitals,documentHeight:document.documentElement.scrollHeight,bytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.transferSize,0)}));
      await page.locator('.polish-hero-actions').getByRole('link',{name:/Explore training/i}).click();
      await page.locator('#training').waitFor();
      if(width===390) {
        const more=page.locator('.mobile-home-nav button[aria-controls="bravo-navigation"]');
        await more.click();await more.click();
        await page.locator('.mobile-home-nav').getByRole('link',{name:'Reviews',exact:true}).click();
      }
      await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,1000)));
      const interactions=await page.evaluate(()=>window.labVitals);
      assert.ok(initial.lcp>0,'LCP measurement exists');
      results.push({width,run,lcpMs:Math.round(initial.lcp),lcpElement:initial.lcpElement,cls:initial.cls,initialTransferBytes:initial.bytes,documentHeight:initial.documentHeight,initialBlockingMs:Math.round(initial.longTaskMs),sampledMaxInteractionMs:interactions.maxInteraction});
      await context.close();
    }
  }
  const summary=[390,1440].map(width=>{
    const samples=results.filter(r=>r.width===width);
    const median=key=>samples.map(r=>r[key]).sort((a,b)=>a-b)[1];
    return {width,lcpMs:median('lcpMs'),cls:median('cls'),initialTransferBytes:median('initialTransferBytes'),documentHeight:median('documentHeight'),initialBlockingMs:median('initialBlockingMs'),sampledMaxInteractionMs:median('sampledMaxInteractionMs')};
  });
  const report={label,conditions:'390px: 4x CPU, 150ms RTT, 1.6Mbps. 1440px: unthrottled. Median of three fresh contexts. Same public fixtures and production homepage renderer; gzip HTML/text assets; external requests blocked. Sampled interaction latency is not field INP.',summary,samples:results};
  await writeFile(`test-results/performance-${label}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
