import { CommunityGroup, User } from './models.js';

// Registration is not consent to expose a client's identity to every account.
// Staff keep their operational directory; clients see only the team, themselves,
// and people with whom they already share an active group.
export async function groupPeopleFilter(user) {
  const active = { blocked: { $ne: true }, removedAt: null };
  if (['owner', 'staff'].includes(user.role)) return active;
  const peers = await CommunityGroup.distinct('members', { members: user._id, archived: false });
  return { ...active, $or: [{ role: { $in: ['owner', 'staff'] } }, { _id: { $in: [user._id, ...peers] } }] };
}

export async function selectableGroupMembers(user, ids) {
  const members = [...new Set(ids.map(id => String(id).toLowerCase()))];
  const allowed = await User.countDocuments({ ...await groupPeopleFilter(user), _id: { $in: members } });
  if (allowed !== members.length) throw Object.assign(new Error('Choose people from your group contact list. Ask Bravo to connect you with another client.'), { status: 403 });
  return members;
}
