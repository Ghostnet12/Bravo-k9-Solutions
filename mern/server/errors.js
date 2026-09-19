import { z } from 'zod';

// Never expose database identifiers, parsed request bodies, or Stripe diagnostics.
export function clientError(error) {
  const transport = requestError(error);
  if (transport) return transport;
  if (error instanceof z.ZodError) return { status: 400, message: error.issues[0]?.message || 'Check the entered values.' };
  if (error.code === 11000) return { status: 409, message: 'That account or time slot already exists. Sign in or choose another opening.' };
  if (error.name === 'CastError' || error.name === 'ValidationError') return { status: 400, message: 'One or more request values are invalid.' };
  if (error.type === 'entity.parse.failed' || error instanceof URIError) return { status: 400, message: 'The request format is invalid.' };
  if (String(error.type || error.name).startsWith('Stripe')) return { status: 502, message: 'Stripe could not complete this request. Retry from the same saved booking or contact Bravo.' };
  if (String(error.name).startsWith('Mongo') || error.databaseIssue) return { status: 503, message: 'The service is temporarily unavailable. Please try again or call Bravo.' };
  const unexpected = error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError || error instanceof SyntaxError;
  const status = unexpected ? 500 : Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 400;
  return { status, message: status >= 500 ? 'The service is temporarily unavailable. Please try again or call Bravo.' : error.message || 'The request could not be completed.' };
}
// Parser messages can contain excerpts of submitted passwords or other private
// text. All app wrappers must sanitize these before returning their own errors.
export function requestError(error) {
  if (error.type === 'entity.parse.failed' || error instanceof URIError) return { status: 400, message: 'The request format is invalid.' };
  if (error.type === 'entity.too.large') return { status: 413, message: 'That request is too large.' };
  if (['encoding.unsupported', 'charset.unsupported'].includes(error.type)) return { status: 415, message: 'The request encoding is not supported.' };
  if (['request.aborted', 'request.size.invalid'].includes(error.type)) return { status: 400, message: 'The request was incomplete. Please try again.' };
  return null;
}
