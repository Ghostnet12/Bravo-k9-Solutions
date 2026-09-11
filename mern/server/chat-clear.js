import mongoose from 'mongoose';
import { z } from 'zod';
import { requireUser } from './auth.js';
import { User, CommunityGroup, AuditEvent } from './models.js';

// A personal clear is durable and account-scoped. It never deletes another
// participant's transcript or changes bookings, billing, or access rights.
const schema = new mongoose.Schema({ _id: String, userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, scope: { type: String, required: true }, clearedAt: { type: Date, required: true } });
export const ChatClear = mongoose.models.BravoChatClear || mongoose.model('BravoChatClear', schema);
const isStaff = user => ['staff', 'owner'].includes(user?.role);
const key = (user, scope) => `${user._id}:${scope}`;
export async function chatVisibility(user, scope) {
  const scopes = [scope, ...(scope.startsWith('direct:') && isStaff(user) ? ['inbox'] : [])];
  const mark = await ChatClear.findOne({ _id: { $in: scopes.map(value => key(user, value)) } }).sort({ clearedAt: -1 }).lean();
  return mark ? { createdAt: { $gt: mark.clearedAt } } : {};
}
export async function visibleInbox(user, threads) {
  if (!threads.length) return threads;
  const marks = await ChatClear.find({ _id: { $in: threads.map(thread => key(user, `direct:${thread._id}`)) } }).lean();
  const cutoffs = new Map(marks.map(mark => [mark.scope, new Date(mark.clearedAt).getTime()]));
  return threads.filter(thread => new Date(thread.updatedAt).getTime() > (cutoffs.get(`direct:${thread._id}`) || 0));
}
const id = z.string().regex(/^[a-f\d]{24}$/i);
const input = z.object({ channel: z.enum(['community', 'direct', 'group', 'inbox']), memberId: id.optional(), groupId: id.optional(), confirm: z.literal(true) }).strict();
export function installChatClear(app) {
  app.post('/api/chat/clear', requireUser, async (req, res) => {
    const data = input.parse(req.body);
    let scope = data.channel;
    if (data.channel === 'inbox' && !isStaff(req.user)) return res.status(403).json({ error: 'Team access required.' });
    if (data.channel === 'direct') {
      if (data.memberId && !isStaff(req.user) && data.memberId !== String(req.user._id)) return res.status(403).json({ error: 'You can only clear your own conversation view.' });
      const memberId = isStaff(req.user) && data.memberId ? data.memberId : String(req.user._id);
      if (!await User.exists({ _id: memberId })) return res.status(404).json({ error: 'Conversation not found.' });
      scope = `direct:${memberId}`;
    }
    if (data.channel === 'group') {
      if (!data.groupId) return res.status(400).json({ error: 'Choose a group.' });
      const group = await CommunityGroup.exists({ _id: data.groupId, archived: false, ...(req.user.role === 'owner' ? {} : { members: req.user._id }) });
      if (!group) return res.status(404).json({ error: 'Group not found.' });
      scope = `group:${data.groupId}`;
    }
    const filter = { _id: key(req.user, scope) };
    const update = { $max: { clearedAt: new Date() }, $setOnInsert: { userId: req.user._id, scope } };
    let mark;
    try { mark = await ChatClear.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' }); }
    catch (error) { if (error.code !== 11000) throw error; mark = await ChatClear.findOneAndUpdate(filter, update, { returnDocument: 'after' }); }
    await AuditEvent.create({ actorId: req.user._id, action: 'chat.clear-own-view', targetType: 'conversation-view', targetId: scope, details: { clearedAt: mark.clearedAt } });
    res.json({ ok: true, scope, clearedAt: mark.clearedAt, visibility: 'your-view-only' });
  });
}
