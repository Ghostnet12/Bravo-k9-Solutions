import {rm,mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {routes} from '../public/content.mjs';
import {documentHTML} from '../public/pages.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.VERCEL_ENV==='production'||['bravo-mern','main'].includes(process.env.VERCEL_GIT_COMMIT_REF))throw new Error('STAGING ONLY: refusing to build for a live environment or production branch.');
const dist=resolve(root,'dist');await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});await cp(resolve(root,'public'),dist,{recursive:true});
for(const route of routes){const output=resolve(dist,route==='/'?'index.html':route.slice(1)+'.html');await mkdir(dirname(output),{recursive:true});await writeFile(output,documentHTML(route));}
await writeFile(resolve(dist,'robots.txt'),'User-agent: *\nDisallow: /\n');
await writeFile(resolve(dist,'staging-status.json'),JSON.stringify({build:'bravo-staging-02',staging:true,liveBooking:false,payments:false,customerData:false,atlas:'disconnected',designEdits:'browser-local',routes:routes.length,branch:process.env.VERCEL_GIT_COMMIT_REF||'local'},null,2));
console.log(`Built ${routes.length} prerendered routes. Bookings, payments and Atlas disconnected.`);
