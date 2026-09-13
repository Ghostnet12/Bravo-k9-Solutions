// One-time, fail-closed source integration. Removed after tests pass.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const hashes = {
 'client/src/MembershipTerms.jsx':['641c6d4d276b326afcd5362d2a40c5f17f3159ada24fc33c1c490ed0620622fe','afc327bf0e0103aa2ef81e009d194fec6ee553ce244135565879d93ed375939e'],
 'client/src/SchedulePage.jsx':['d024fb5021ec01a191f4a3877cf4f6a7d378914f12b1e966b6f88332d26625f8','477b44ad4ea8f1aef365c56cc5312e7cbf0d23bd927b9e4109af6e8f6a28a6d0'],
 'client/src/StaffScheduleEditor.jsx':['fa3a177a8e41c66fc1edbdbc46e3ba6c1b162cbc136c7e67bb62e1d96ab9d3f3','855db81f9b96abf1e7bb4e105fb8995044cc3a85eeed31035f3d22bf597b0209'],
 'server/client-services-app.js':['9c8a3b7442ffb9f673f7542e13ea8771609b8d556268675b0f15691accc86466','a986e23835d53f48721dc53e8da5b5dc3bf0c20c81fa27c5cbb6cbb8b11ae593'],
 'server/manual-training.js':['bf7ba0b1fa9d84564d5e0c463146a91d43f256f03721261e080ef53ec1d40e89','7ca8a240f7cdf3d6cadbb9a2c1ccdec1e3fab00de64dc16365ed00484afac980'],
 'server/member-app.js':['46aa797205caf052de49b708922880a61be143ba312c3f55f7811fb81ad9ff17','4b985d4e9d97776bd2873a5e01de17b71fbbbf85c31e7307859507f60e4c9dc7'],
 'server/models.js':['61f699bea9549ca6d84c05af16f9cd0c95a1a9b78b25b6e5cfa39276e32944cf','498a300ca5f8bae4d6d297bada074f03a8c49a6cccb3cefd41b377bc3a1e6783'],
 'server/payments.js':['d2586efd43b72cd90ff4508b9489f78752da8cfca4f7af5f9506209b4268d99e','e442ace6e804de7ad08fb35fd5b6f2be1bfe33f222e8309c40defced94ea2430']
};
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
for (const [p,[before]] of Object.entries(hashes)) if(sha(p)!==before) throw new Error(`Baseline changed: ${p}`);
function edit(p,from,to){const text=readFileSync(p,'utf8');if(text.split(from).length!==2)throw new Error(`Ambiguous edit: ${p}`);writeFileSync(p,text.replace(from,to));}
edit('server/client-services-app.js',"import { reserveVisits, releaseVisit } from './reservations.js';","import { creditClients, creditDetails, creditTrainingDays } from './training-credits.js';\nimport { reserveVisits, releaseVisit } from './reservations.js';");
edit('server/client-services-app.js',"app.get('/api/client-schedule',","app.get('/api/admin/training-credits/clients', ...session, requireStaff, creditClients);\napp.get('/api/training-credits', ...session, requireUser, creditDetails);\napp.post('/api/admin/training-credits', ...session, requireStaff, ...write, rateLimit('day-credit', 40, 3600000), creditTrainingDays);\n\napp.get('/api/client-schedule',");
edit('server/models.js',"lastEventAt: Number }, { timestamps: true });","lastEventAt: Number, creditedDays: { type: Number, default: 0, min: 0 }, creditBaseEnd: Date, creditPeriodStart: Date }, { timestamps: true });");
edit('server/payments.js',"import { monthTerm } from '../shared/membership-terms.js';","import { monthTerm } from '../shared/membership-terms.js';\nimport { retainPeriodCredits } from '../shared/training-credits.js';");
edit('server/payments.js',"validFrom: new Date(from * 1000), validUntil: new Date(until * 1000),","validFrom: new Date(from * 1000), ...retainPeriodCredits(previous, new Date(from * 1000), new Date(until * 1000)),");
edit('client/src/SchedulePage.jsx',"import TrainingRecovery from './TrainingRecovery';","import TrainingRecovery from './TrainingRecovery';\nimport TrainingDayCredits from './TrainingDayCredits';");
edit('client/src/SchedulePage.jsx',"      {(user.role !== 'owner'","      <TrainingDayCredits clientId={data.client.id} onSaved={message => { setNotice(message); setRevision(n => n + 1); }}/>\n      {(user.role !== 'owner'");
edit('client/src/StaffScheduleEditor.jsx',"import { notifyTrainerScheduleChanged } from './TrainerScheduleCard';","import { notifyTrainerScheduleChanged } from './TrainerScheduleCard';\nimport { TrainingCreditsDesk } from './TrainingDayCredits';");
edit('client/src/StaffScheduleEditor.jsx',"<Editor key={staffId} staffId={staffId}/>","<Editor key={staffId} staffId={staffId}/>\n    <TrainingCreditsDesk/>");
edit('server/manual-training.js',"  let booking = subscription?.bookingId","  if (subscription?.creditedDays && subscription.validFrom.getTime() === term.validFrom.getTime()) term = { ...term, validUntil: new Date(Math.max(subscription.validUntil.getTime(), term.validUntil.getTime())) };\n  else if (subscription?.creditedDays) { subscription.creditedDays = 0; subscription.creditBaseEnd = null; subscription.creditPeriodStart = null; }\n  let booking = subscription?.bookingId");
edit('server/manual-training.js',"return { bookingId: booking._id, subscriptionId: subscription.stripeId, dogCount };","return { bookingId: booking._id, subscriptionId: subscription.stripeId, dogCount, validUntil: subscription.validUntil };");
edit('server/member-app.js',"record.trainingDogCount = training.dogCount;","record.trainingDogCount = training.dogCount; record.endsAt = training.validUntil;");
edit('server/member-app.js',"grant.trainingDogCount = training.dogCount;","grant.trainingDogCount = training.dogCount; grant.endsAt = training.validUntil;");
edit('server/client-services-app.js',".select('stripeId serviceIds dogCount validFrom validUntil status autoPayDisabled renewalDeclined renewalOf source')",".select('stripeId serviceIds dogCount validFrom validUntil status autoPayDisabled renewalDeclined renewalOf source creditedDays creditBaseEnd')");
edit('client/src/MembershipTerms.jsx',"  useEffect(() => { load().catch(e => setError(e.message)); }, []);","  useEffect(() => { const refresh = () => load().catch(e => setError(e.message)); refresh(); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, []);");
edit('client/src/MembershipTerms.jsx',"<p><strong>{renewed ? 'Renewed'","{term.creditedDays > 0 && <p className=\"helper\">Includes {term.creditedDays} credited calendar day(s). Original end: {date(term.creditBaseEnd)}. No extra payment.</p>}<p><strong>{renewed ? 'Renewed'");
for (const [p,[,after]] of Object.entries(hashes)) if(sha(p)!==after) throw new Error(`Integrated source differs from tested source: ${p}`);
const added = {
 'shared/training-credits.js':'6cf4a0900adc40e1f98459585e5fa34f60c0160d4e3279665110c7a97a3ac1c3',
 'server/training-credits.js':'8123fa4041f269d0a90babc7055c4d9393af3aa08004ecfa23d99f311daa7ecd',
 'client/src/TrainingDayCredits.jsx':'4f95f4707dacdde952eafd793cdf2adeef6d46c889de62ad38abe328b402dc20',
 'client/src/training-credits.css':'bde6059f774e1b291b3386a2a8b388b12b8c141cd2bb4dc56d97a4b757b250db',
 'tests/training-credits.test.js':'6f16adc18830c7485df51fa08f5bf90f1c39736d6da72c36be372a4176bd51e7',
 'tests/training-credits.integration.js':'beb121447916e3488083489b544fc83c7d9e5e4489bc54b157479a6b7920e187',
 'tests/training-credits.browser.mjs':'5f051fae9cda0ffe8363b61f28231430fde22144bb9a0b8e6fe2ece1561e9f9a'
};
for(const [p,expected]of Object.entries(added))if(sha(p)!==expected)throw new Error(`New source checksum mismatch: ${p}`);
console.log('Exact source installed; all 15 SHA-256 checks passed.');
