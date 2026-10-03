// Optional read-only adapter. NEVER use the live site's MONGO_URI or production database.
// Configure only with a separately scoped preview credential after owner approval.
const DB='bravo_concept_preview';
let connection;
const fallback={preview:true,source:'bundled',atlas:'not_configured',announcement:'Online training videos — coming soon.',liveBooking:false,payments:false};
export default async function handler(req,res){
 res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
 res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=120');
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).json({error:'Read-only preview endpoint'});}
 if(process.env.VERCEL_ENV==='production')return res.status(403).json({error:'Preview only'});
 if(req.method==='HEAD')return res.status(200).end();
 const uri=process.env.BRAVO_PREVIEW_MONGO_URI;
 if(!uri)return res.status(200).json(fallback);
 try{
  if(!connection){const {MongoClient}=await import('mongodb');const client=new MongoClient(uri,{maxPoolSize:2,connectTimeoutMS:2000,serverSelectionTimeoutMS:2500});connection=client.connect().catch(e=>{connection=undefined;throw e;});}
  const client=await connection;
  const doc=await client.db(DB).collection('site_content').findOne({_id:'bravo-cinematic-v1'},{projection:{_id:0,announcement:1},maxTimeMS:1500});
  if(!doc)return res.status(200).json({...fallback,atlas:'preview_content_missing'});
  const announcement=typeof doc.announcement==='string'&&doc.announcement.length<=160?doc.announcement:fallback.announcement;
  return res.status(200).json({...fallback,source:'atlas',atlas:'read_only',announcement});
 }catch{return res.status(200).json({...fallback,atlas:'unavailable'});}
}
