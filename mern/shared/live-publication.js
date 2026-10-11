import { z } from 'zod';
const counter = z.number().int().nonnegative().safe();
// Existing connected clients can finish normally. New phones report observed
// camera frames honestly, not fabricated encoder/decoder statistics.
export const publicationInput = z.union([
  z.object({ id: z.uuid(), kind: z.literal('camera'), framesCaptured: counter }).strict(),
  z.object({ id: z.uuid(), framesEncoded: counter, framesDecoded: counter }).strict(),
]);
export function publicationAdvances(current, previous) {
  if (!current) return false;
  if (current.kind === 'camera') {
    return current.framesCaptured >= 2 && (previous?.id !== current.id ||
      (previous.kind === 'camera' && current.framesCaptured > previous.framesCaptured));
  }
  return current.framesEncoded > 0 && current.framesDecoded > 0 && (previous?.id !== current.id ||
    (!previous.kind && current.framesEncoded > previous.framesEncoded && current.framesDecoded > previous.framesDecoded));
}
