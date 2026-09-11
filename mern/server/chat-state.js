import { z } from 'zod';
import { ChatReset, CommunityGroup, Message, DirectMessage, GroupMessage, AuditEvent } from './models.js';
import { transaction } from './db.js';

export const resetKey = (user, scope) => `${String(user._id)}:${scope}`;
export async function chatFilter(user, scope) {
  const keys = [resetKey(user, scope)];
  if (scope.startsWith('direct:') && ['staff', 'owner'].includes(user.role)) keys.push(resetKey(user, 'inbox'));
  const rows = await ChatReset.find({ _id: { $in: keys } }).lean();
  const time = rows.reduce((latest, row) => Math.max(latest, new Date(row.clearedAt).getTime() || 0), 0);
  return time ? { createdAt: { $gt: new Date(time) } } : {};
}
export async function visibleInbox(user, inbox) {
  const rows = await ChatReset.find({ _id: { $in: inbox.map(thread => resetKey(user, `direct:${thread._id}`)) } }).lean();
  const cutoffs = new Map(rows.map(row => [row._id, new Date(row.clearedAt).getTime()]));
  return inbox.filter(thread => new Date(thread.updatedAt).getTime() > (cutoffs.get(resetKey(user, `direct:${thread._id}`)) || 0));
}
const input = z.object({ scope: z.enum(['room', 'direct', 'group', 'inbox']), targetId: z.string().regex(/^[a-f\d]{24}$/i).optional(), mode: z.enum(['clear', 'delete']).default('clear'), confirmDelete: z.boolean().optional() }).strict();
export async function resetChat(req, res) {
  const data = input.parse(req.body);
  const staff = ['staff', 'owner'].includes(req.user.role);
  let scope = data.scope, Model, filter;
  if (scope === 'room') { Model = Message; filter = {}; }
  if (scope === 'inbox' && !staff) return res.status(403).json({ error: 'Team access required.' });
  if (scope === 'direct') {
    if (data.targetId && !staff && data.targetId !== String(req.user._id)) return res.status(403).json({ error: 'You can only clear your own conversation.' });
    const memberId = staff && data.targetId ? data.targetId : String(req.user._id);
    scope = `direct:${memberId}`; Model = DirectMessage; filter = { memberId };
  }
  if (data.scope === 'group') {
    if (!data.targetId) return res.status(400).json({ error: 'Choose a group.' });
    const group = await CommunityGroup.findOne({ _id: data.targetId, archived: false, ...(req.user.role === 'owner' ? {} : { members: req.user._id }) }).lean();
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    scope = `group:${group._id}`; Model = GroupMessage; filter = { groupId: group._id };
  }
  if (data.mode === 'delete' && req.user.role !== 'owner') return res.status(403).json({ error: 'Only the owner or an administrator can delete shared history.' });
  if (data.mode === 'delete' && (!data.confirmDelete || !Model)) return res.status(400).json({ error: 'Select one conversation and confirm permanent deletion. Whole-inbox deletion is not supported.' });
  const clearedAt = new Date();
  let deletedCount = 0;
  if (data.mode === 'delete') {
    await transaction(async session => {
      const result = await Model.deleteMany({ ...filter, createdAt: { $lte: clearedAt } }, { session });
      deletedCount = result.deletedCount;
      await ChatReset.updateOne({ _id: resetKey(req.user, scope) }, { $max: { clearedAt } }, { upsert: true, session });
      await AuditEvent.create([{ actorId: req.user._id, action: 'chat.history.delete', targetType: data.scope, targetId: data.targetId || 'room', details: { deletedCount, through: clearedAt.toISOString() } }], { session });
    });
  } else {
    await ChatReset.updateOne({ _id: resetKey(req.user, scope) }, { $max: { clearedAt } }, { upsert: true });
  }
  res.json({ ok: true, mode: data.mode, clearedAt: clearedAt.toISOString(), deletedCount });
}
