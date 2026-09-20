import { randomBytes, createCipheriv, createDecipheriv, createHmac, createHash, timingSafeEqual } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newSecret() {
  return [...randomBytes(20)].map(byte => byte.toString(2).padStart(8, '0')).join('').match(/.{5}/g).map(bits => alphabet[parseInt(bits, 2)]).join('');
}
function decode(secret) {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('Invalid authenticator secret');
  const bits = [...secret].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  return Buffer.from(bits.match(/.{8}/g).map(value => parseInt(value, 2)));
}
function key() {
  const value = process.env.MFA_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}$/i.test(value || '')) throw Object.assign(new Error('Two-step verification is temporarily unavailable. Contact Bravo.'), { status: 503 });
  return Buffer.from(value, 'hex');
}
export function mfaConfigured() { return /^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || ''); }
export function seal(secret, userId) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`bravo-mfa:v1:${userId}`));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}
export function unseal(value, userId) {
  const [version, iv, tag, encrypted] = value.split(':');
  if (version !== 'v1') throw new Error('Unsupported authenticator key version');
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
  cipher.setAAD(Buffer.from(`bravo-mfa:v1:${userId}`)); cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([cipher.update(Buffer.from(encrypted, 'hex')), cipher.final()]).toString('utf8');
}
export function totp(secret, step, digits = 6) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', decode(secret)).update(counter).digest(), offset = mac[19] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
export function matchingStep(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) if (timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  return null;
}
export const recoveryHash = code => createHash('sha256').update(code.replace(/[-\s]/g, '').toLowerCase()).digest('hex');
export const newRecoveryCodes = () => Array.from({ length: 10 }, () => randomBytes(16).toString('hex').match(/.{8}/g).join('-'));
