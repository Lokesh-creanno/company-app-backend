const crypto = require('crypto');

// Reversible password storage so a SUPER_ADMIN can view a user's password later
// (product requirement), while a raw DB dump alone does NOT expose passwords —
// they are AES-256-GCM encrypted at rest with a server-held key.
//
// Key source: PASSWORD_ENC_KEY env (any string) if set, else derived from
// JWT_SECRET so existing deployments work with no new env var. Set a dedicated
// PASSWORD_ENC_KEY in production. Rotating either value makes old ciphertexts
// unreadable (users would need password resets).
// ponytail: single global key, no per-record salt rotation — fine for this scale.
const KEY = crypto.scryptSync(
  process.env.PASSWORD_ENC_KEY || process.env.JWT_SECRET || 'creanno-dev-key',
  'creanno-pwd-enc-v1',
  32,
);

// Encrypt -> "iv:tag:ciphertext" (all base64). Returns null for empty input.
function encryptSecret(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

// Decrypt back to plaintext. Returns null if input is empty or tampered/undecryptable.
function decryptSecret(blob) {
  if (!blob || typeof blob !== 'string' || !blob.includes(':')) return null;
  try {
    const [ivB64, tagB64, dataB64] = blob.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (_) {
    return null;
  }
}

// Constant-time compare of a candidate password against the stored ciphertext.
function verifySecret(candidate, blob) {
  const actual = decryptSecret(blob);
  if (actual == null) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(String(candidate));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { encryptSecret, decryptSecret, verifySecret };

// ── Self-check (run: node src/utils/secret.js) ──────────────────────────────
if (require.main === module) {
  const s = 'Hunter2!';
  const blob = encryptSecret(s);
  console.assert(blob && blob.split(':').length === 3, 'blob shape');
  console.assert(decryptSecret(blob) === s, 'roundtrip');
  console.assert(verifySecret(s, blob) === true, 'verify ok');
  console.assert(verifySecret('wrong', blob) === false, 'verify reject');
  console.assert(decryptSecret('garbage') === null, 'garbage safe');
  console.log('secret.js self-check passed');
}
