import {rm,mkdir,cp,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {routes} from '../public/content.mjs';
import {documentHTML} from '../public/pages.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.VERCEL_ENV==='production'||['bravo-mern','main'].includes(process.env.VERCEL_GIT_COMMIT_REF))throw new Error('STAGING ONLY: refusing to build for a live environment or production branch.');
const dist=resolve(root,'dist');await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});await cp(resolve(root,'public'),dist,{recursive:true});
for(const route of routes){const output=resolve(dist,route==='/'?'index.html':route.slice(1)+'.html');await mkdir(dirname(output),{recursive:true});const html=documentHTML(route).replace('<a href="/preview">','<a href="/relay">Trainer alert lab ↗</a><a href="/preview">');await writeFile(output,html);}
await writeFile(resolve(dist,'robots.txt'),'User-agent: *\nDisallow: /\n');
await writeFile(resolve(dist,'relay-status.json'),JSON.stringify({build:'bravo-relay-lab-01',staging:true,authentication:'not-implemented-public-demo',scheduler:'fictional-simulator-only',storage:'browser-session',atlas:'disconnected',smsTransport:'user-initiated-native-composer',automaticSMS:false,pushDelivery:false,carrierDeliveryVerified:false,paidMessagingService:false,productionChanges:false},null,2));
await writeFile(resolve(dist,'staging-status.json'),JSON.stringify({build:'bravo-staging-02-relay-lab',staging:true,liveBooking:false,payments:false,customerData:false,atlas:'disconnected',designEdits:'browser-local',routes:routes.length,extraRoutes:['/relay'],branch:process.env.VERCEL_GIT_COMMIT_REF||'local'},null,2));
console.log(`Built ${routes.length} original staging routes plus /relay. Production systems remain disconnected.`);
