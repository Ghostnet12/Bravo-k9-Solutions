import { z } from 'zod';
import { Booking, User } from './models.js';
import { assignTrainer } from './bookings.js';
import { trainerSelectionInput, resolveTrainerSelection } from './trainer-selection.js';
import { bookingTrainerIds, selectedTrainerId, SHARED_TRAINER_ID } from '../shared/trainer-selection.js';
const id=z.string().regex(/^[a-f\d]{24}$/i);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function allowedTrainer(req,staffId) {
  if(req.user.role!=='owner' && String(req.user._id)!==staffId) throw fail('Only this trainer, an administrator, or the owner can accept this client.',403);
  if(!await User.exists({_id:staffId,role:{$in:['staff','owner']},blocked:{$ne:true}})) throw fail('Choose an active trainer.',404);
}
export async function trainerClients(req,res) {
  const staffId=id.parse(req.params.id);await allowedTrainer(req,staffId);
  const bookings=await Booking.find({serviceIds:'training',status:{$in:['requested','confirmed','waitlisted']},$or:[{staffId},{coTrainerId:staffId},{staffId:null,requestedStaffId:staffId},{staffId:null,requestedCoTrainerId:staffId}]}).select('userId dogName dogCount status staffId coTrainerId requestedStaffId requestedCoTrainerId trainerAcceptedIds trainerAcceptanceRequired trainerAcceptedAt updatedAt').populate({path:'userId',model:User,select:'name'}).sort({trainerAcceptanceRequired:-1,updatedAt:-1}).limit(100).lean();
  res.json({bookings:bookings.map(b=>({...b,clientName:b.userId?.name||'Former client',clientId:b.userId?._id||null,userId:undefined}))});
}
export async function acceptClient(req,res) {
  const bookingId=id.parse(req.params.id),{staffId,revision}=z.object({staffId:trainerSelectionInput,revision:z.string().datetime()}).strict().parse(req.body);
  if (staffId === SHARED_TRAINER_ID) {
    if(req.user.role !== 'owner') throw fail('Only an administrator or owner can accept for both trainers.',403);
    await resolveTrainerSelection(staffId);
  } else await allowedTrainer(req,staffId);
  const booking=await Booking.findById(bookingId);
  if(!booking || !booking.serviceIds.includes('training') || !['requested','confirmed','waitlisted'].includes(booking.status)) throw fail('Choose an active training request.',404);
  if(booking.updatedAt.toISOString()!==revision) throw fail('This request changed. Refresh before accepting.',409);
  const chosen=bookingTrainerIds(booking),shared=staffId===SHARED_TRAINER_ID;
  if(chosen.length && (shared ? selectedTrainerId(booking)!==staffId : !chosen.includes(staffId))) throw fail('This client is assigned to another trainer. Reassign them first.',409);
  if((!shared && (booking.trainerAcceptedIds||[]).map(String).includes(staffId)) || (booking.trainerAcceptedAt&&!booking.trainerAcceptanceRequired)) return res.json({ok:true,message:'This client has already been accepted.',booking});
  const updated=await assignTrainer(booking,chosen.length?selectedTrainerId(booking):staffId,{acceptedBy:req.user._id,acceptedStaffId:shared?undefined:staffId,expectedUpdatedAt:booking.updatedAt});
  res.json({ok:true,message:updated.trainerAcceptanceRequired?'Acceptance saved. The other trainer still needs to accept.':'Client accepted. Their saved schedule now shows the trainer’s name.',booking:updated});
}
