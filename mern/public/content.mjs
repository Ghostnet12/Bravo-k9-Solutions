export const defaults = Object.freeze({ headline:'Real-world training.', secondLine:'For real dogs.', accentLine:'For real life.', description:'Better communication. A calmer companion. Training built for the life you share.', announcement:'Online training videos — coming soon.', gold:'#BA9A64' });
export const programs = [
 {id:'basic-obedience',name:'Basic Obedience',category:'everyday',image:'obedience-real-world.webp',intro:'A stronger foundation for the life you share.',description:'Start with clearer communication and everyday skills. Build focus, calmer walks, and a more connected relationship.',skills:['Communication and engagement','Everyday manners','Leash skills','Practice around everyday distractions']},
 {id:'advanced-training',name:'Advanced Training',category:'everyday',image:'hero-bravo-k9.webp',intro:'Build on the basics. Bring it into real life.',description:'Develop the skills you have started, with a training path shaped around your dog, your progress, and your goals.',skills:['Focus around distractions','Building on foundational skills','Consistency across environments','Handler confidence']},
 {id:'service-dog-training',name:'Service Dog Training',category:'working',image:'service-dog-training.webp',intro:'An individual path. A meaningful partnership.',description:'Discuss your needs and your dog’s suitability with a trainer before choosing a training path. The starting point is an individual assessment, not a one-size-fits-all promise.',skills:['Individual suitability assessment','Handler-dog teamwork','Task-focused planning','Environmental confidence']},
 {id:'executive-protection',name:'Executive Protection',category:'working',image:'protection-training.webp',intro:'Purposeful training starts with responsible control.',description:'A specialist discussion of suitability, handling, and your goals. Assessment comes before any training commitment.',skills:['Suitability and temperament','Clear handling and communication','Control and steadiness','An individually reviewed training plan']},
 {id:'hunting-dog-training',name:'Hunting Dog Training',category:'working',image:'tracking-training.webp',intro:'A better partnership. From the leash to the field.',description:'Explore field-focused communication and a training path built around your dog’s experience and your hunting goals.',skills:['Field-focused engagement','Steadiness','Handler communication','A purposeful working partnership']},
 {id:'search-and-rescue',name:'Search & Rescue',category:'working',image:'bravo-prairie-background.webp',intro:'Give drive a direction.',description:'Discuss an appropriate starting point for scent-focused work, concentration, and handler-dog teamwork.',skills:['Focus and motivation','Scent-work foundations','Environmental experience','Handler-dog teamwork']},
 {id:'law-enforcement-k9',name:'Law Enforcement K9',category:'working',image:'protection-training.webp',intro:'A specialist path for working teams.',description:'Start with a conversation about your team, the dog’s suitability, and training objectives. Final scope is determined through individual review.',skills:['Individual assessment','Handler partnership','Clear control','Purpose-specific training objectives']},
 {id:'job-specific-training',name:'Job-Specific Training',category:'working',image:'training-education.webp',intro:'A clear purpose. A considered plan.',description:'Build a training discussion around a specific task, the dog’s strengths, and the practical skills the partnership needs.',skills:['Goal setting','Suitability review','Task-focused planning','Everyday application']}
];
export const people = [
 {id:'david',name:'David Northrop',role:'Founder / Lead Dog Trainer',image:'david-northrop.webp',text:'David leads Bravo’s training approach and works with owners to build clearer communication and a stronger partnership with their dogs.'},
 {id:'ashley',name:'Ashley Leverock',role:'Trainer / Pitbull Specialist',image:'ashley-leverock.webp',text:'Ashley brings a focus on the individual dog and the person on the other end of the leash.'},
 {id:'janet',name:'Janet Hughes',role:'Trainer',image:'janet-hughes.webp',text:'Janet is part of the Bravo training team, helping owners work toward their goals with their dogs.'}
];
export const gallery = [
 {image:'obedience-real-world.webp',name:'Everyday training',type:'everyday'},
 {image:'bravo-client-training.jpeg',name:'Training together',type:'everyday'},
 {image:'tracking-training.webp',name:'Out in the field',type:'working'},
 {image:'service-dog-training.webp',name:'Working partnership',type:'working'},
 {image:'protection-training.webp',name:'Specialist training',type:'working'},
 {image:'training-education.webp',name:'Learning together',type:'everyday'}
];
export const links=[['/','Home'],['/training','Training'],['/about','Our approach'],['/team','The team'],['/gallery','In action'],['/reviews','Client stories'],['/online','Online training']];
export const routes=['/', '/training',...programs.map(p=>'/training/'+p.id),'/about','/team',...people.map(p=>'/team/'+p.id),'/gallery','/reviews','/online','/booking','/preview','/404'];
export const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateEdits(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const result={}; for(const key of Object.keys(defaults)){
  if(typeof value[key]!=='string')continue;
  const v=value[key].trim();const max=['description','announcement'].includes(key)?220:70;
  if(key==='gold'){if(/^#[0-9a-f]{6}$/i.test(v))result[key]=v;}
  else if(v.length&&v.length<=max)result[key]=v;
 }
 return result;
}
export function validatePlan(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const program=programs.find(p=>p.id===value.program)?.id||'unsure';
 const trainer=['Any trainer',...people.map(p=>p.name)].includes(value.trainer)?value.trainer:'Any trainer';
 const days=Array.isArray(value.days)?[...new Set(value.days.filter(d=>['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(d)))]:[];
 const time=['Morning','Afternoon','Evening'].includes(value.time)?value.time:'Evening';
 return {program,trainer,days,time};
}
