export const TRANSPORT_STATUSES = {
  scheduled: 'Scheduled', picked_up: 'Picked up', in_transit: 'On the road',
  rest_stop: 'Rest stop', delayed: 'Delayed', delivered: 'Delivered', cancelled: 'Cancelled',
};
export const TRACKABLE_STATUSES = ['picked_up', 'in_transit', 'rest_stop', 'delayed'];
export const FINAL_TRANSPORT_STATUSES = ['delivered', 'cancelled'];
export const LOCATION_FRESH_MS = 120000;

// A recent HTTP response is not evidence of a recent GPS fix.
export function transportLocationState(trip, now = Date.now()) {
  if (FINAL_TRANSPORT_STATUSES.includes(trip.status)) return 'ended';
  if (!trip.sharingEnabled || !TRACKABLE_STATUSES.includes(trip.status)) return 'paused';
  const observed = new Date(trip.location?.observedAt).getTime();
  if (!Number.isFinite(observed)) return 'waiting';
  return now - observed >= 0 && now - observed <= LOCATION_FRESH_MS ? 'live' : 'stale';
}

export function transportMapUrl(location) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  const { latitude: lat, longitude: lon } = location;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const params = new URLSearchParams({
    bbox: [Math.max(-180, lon - .12), Math.max(-85, Math.min(85, lat - .08)), Math.min(180, lon + .12), Math.max(-85, Math.min(85, lat + .08))].join(','),
    layer: 'mapnik', marker: `${lat},${lon}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${params}`;
}
