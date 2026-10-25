// Outcomes come from saved booking records, never from a browser event. The
// customer identifier is used inside MongoDB only; reports return counts.
export function bookingFunnelPipeline(since, now, bookingCollection) {
  const confirmedBooking = { $and: [
    { $eq: ['$$b.status', 'confirmed'] },
    { $gt: [{ $size: { $ifNull: ['$$b.visits', []] } }, 0] },
  ] };
  const any = condition => ({ $cond: [{ $gt: [{ $size: { $filter: { input: '$bookings', as: 'b', cond: condition } } }, 0] }, 1, 0] });
  const counts = {
    visits: { $sum: 1 }, started: { $sum: '$started' }, saved: { $sum: '$saved' },
    confirmed: { $sum: '$confirmed' }, paid: { $sum: '$paid' }, abandoned: { $sum: '$abandoned' },
  };
  return [
    { $match: { firstSeen: { $gte: since }, expiresAt: { $gt: now } } },
    { $lookup: { from: bookingCollection, localField: '_id', foreignField: 'analyticsSession', pipeline: [{ $project: { _id: 0, userId: 1, status: 1, visits: 1, paymentStatus: 1, paidAt: 1 } }], as: 'bookings' } },
    { $set: {
      started: { $cond: ['$started', 1, 0] },
      saved: { $cond: [{ $gt: [{ $size: '$bookings' }, 0] }, 1, 0] },
      confirmed: any(confirmedBooking),
      paid: any({ $and: [{ $ne: [{ $ifNull: ['$$b.paidAt', null] }, null] }, { $in: ['$$b.paymentStatus', ['paid', 'refunded']] }] }),
      abandoned: { $cond: [{ $and: ['$started', { $lt: ['$firstSeen', new Date(now.getTime() - 30 * 60 * 1000)] }, { $eq: [{ $size: '$bookings' }, 0] }] }, 1, 0] },
    } },
    { $facet: {
      channels: [{ $group: { _id: '$channel', ...counts } }, { $sort: { _id: 1 } }],
      daily: [{ $group: { _id: { $dateToString: { date: '$firstSeen', format: '%Y-%m-%d', timezone: 'UTC' } }, ...counts } }, { $sort: { _id: 1 } }],
      customers: [
        { $project: { bookings: { $filter: { input: '$bookings', as: 'b', cond: confirmedBooking } } } },
        { $unwind: '$bookings' }, { $match: { 'bookings.userId': { $ne: null } } },
        { $group: { _id: '$bookings.userId' } }, { $count: 'count' },
      ],
      stages: [{ $unwind: '$stages' }, { $group: { _id: '$stages', count: { $sum: 1 } } }],
    } },
  ];
}
