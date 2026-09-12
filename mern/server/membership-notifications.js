import { DateTime } from 'luxon';
import { Subscription, Notification, User } from './models.js';
import { reminderPhase, MEMBERSHIP_ZONE } from '../shared/membership-terms.js';

// An event belongs to a paid term, not a cron invocation. Retrying cannot create
// duplicate reminders, and each staff member has their own read receipt.
export async function membershipNotifications(now = new Date()) {
  const until = DateTime.fromJSDate(now, { zone: MEMBERSHIP_ZONE }).plus({ days: 2 }).startOf('day').toJSDate();
  const terms = await Subscription.find({ status: { $in: ['active', 'trialing', 'canceled'] }, validUntil: { $lte: until, $gte: new Date(now.getTime() - 31 * 86400000) } }).lean();
  let created = 0;
  for (const term of terms) {
    const phase = reminderPhase(term.validUntil, now);
    if (!phase) continue;
    const renewed = await Subscription.exists({ userId: term.userId, renewalOf: term.stripeId, status: 'active', validUntil: { $gt: term.validUntil } });
    if (renewed) continue;
    const user = await User.findById(term.userId).select('name').lean();
    if (!user) continue;
    const date = DateTime.fromJSDate(new Date(term.validUntil), { zone: MEMBERSHIP_ZONE }).toFormat('MMM d, yyyy h:mm a');
    const key = `term:${term.stripeId}:${new Date(term.validUntil).toISOString()}:${phase}`;
    const clientBody = phase === 'tomorrow' ? `Your training membership ends tomorrow (${date}, Aberdeen time). Renew manually to continue training, or choose not to renew. There is no automatic payment.` : `Your training membership expired (${date}, Aberdeen time). Renew manually when you are ready to continue. No automatic renewal payment was taken.`;
    for (const staff of [false, true]) {
      const result = await Notification.updateOne({ _id: `${key}:${staff ? 'staff' : 'client'}` }, { $setOnInsert: { userId: term.userId, staff, body: staff ? `${user.name}: ${phase === 'tomorrow' ? 'membership expires tomorrow' : 'membership expired without renewal'} (${date}, Aberdeen time).` : clientBody, href: staff ? `/schedule?client=${term.userId}` : '/account', createdAt: now } }, { upsert: true });
      created += result.upsertedCount;
    }
  }
  return created;
}
