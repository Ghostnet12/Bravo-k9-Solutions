// Match the confirmation to the submitted request rather than assuming one visit.
export function bookingRequestNotice({ visits = [], serviceIds = [] } = {}) {
  const count = Array.isArray(visits) ? visits.length : 0;
  if (count === 1) return 'Your appointment request has been submitted. Bravo will confirm your selected date and time. No card has been charged.';
  if (count > 1) return `Your request for ${count} visits has been submitted. Bravo will confirm your requested dates and times. No card has been charged.`;
  if (Array.isArray(serviceIds) && serviceIds.includes('online')) return 'Your online training request has been submitted. No appointment was scheduled. No card has been charged.';
  return 'Your request has been submitted without scheduled visits. Bravo will review the details. No card has been charged.';
}
