import { AccessToken, RoomServiceClient, TrackSource, TrackType, WebhookReceiver } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';

// A fixed first-party origin keeps both the static Vercel CSP and Express CSP
// narrow. Point this DNS name at the separately hosted media service.
export const LIVE_ORIGIN = 'wss://live.bravounleashed.com';
export function liveConfigured() {
  return process.env.BRAVO_LIVE_ENABLED === 'true' && process.env.LIVEKIT_URL === LIVE_ORIGIN &&
    !!process.env.LIVEKIT_API_KEY && (process.env.LIVEKIT_API_SECRET?.length || 0) >= 32;
}
const unavailable = () => Object.assign(new Error('Bravo Live is not connected yet.'), { status: 503 });
export function liveRoomService() {
  if (!liveConfigured()) throw unavailable();
  return new RoomServiceClient(LIVE_ORIGIN.replace('wss:', 'https:'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { requestTimeout: 8 });
}
export async function liveToken(session, publish = false) {
  if (!liveConfigured()) throw unavailable();
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: publish ? session.publisherIdentity : `viewer-${randomUUID()}`,
    name: publish ? session.trainerName : 'Viewer', ttl: '60s',
  });
  token.addGrant({ room: session.roomName, roomJoin: true, canSubscribe: !publish,
    canPublish: publish, canPublishData: false, canUpdateOwnMetadata: false,
    ...(publish ? { canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE] } : {}),
  });
  return { token: await token.toJwt(), url: LIVE_ORIGIN };
}
export async function cameraIsPublishing(session) {
  try {
    const participant = await liveRoomService().getParticipant(session.roomName, session.publisherIdentity);
    return participant.tracks.some(track => track.type === TrackType.VIDEO && track.source === TrackSource.CAMERA && !track.muted);
  } catch (error) {
    if (error.code === 'not_found' || error.status === 404) return false;
    throw unavailable();
  }
}
export async function deleteLiveRoom(session) {
  try { await liveRoomService().deleteRoom(session.roomName); }
  catch (error) { if (error.code !== 'not_found' && error.status !== 404) throw unavailable(); }
}
export async function receiveLiveEvent(body, authorization) {
  if (!liveConfigured()) throw unavailable();
  return new WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET).receive(body, authorization);
}
