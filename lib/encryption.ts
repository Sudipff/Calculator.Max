import crypto from 'crypto';

const ENCRYPTION_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

let cachedKey: Buffer | null = null;
let keyWarningLogged = false;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const rawSecret = (
    process.env.DATA_ENCRYPTION_KEY ||
    process.env.AUTH_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.DATABASE_URL ||
    ''
  ).trim();

  if (!rawSecret && !keyWarningLogged) {
    keyWarningLogged = true;
    console.warn(
      '[Security] DATA_ENCRYPTION_KEY is not set; using ephemeral/process-scoped derived fallback key. Set DATA_ENCRYPTION_KEY in production for persistent field-level decryption.'
    );
  }

  const material = rawSecret || `calculator-max-local-dev-key:${process.cwd()}`;

  // If caller provided a 64-char hex key (32 bytes), decode directly; otherwise derive via scrypt
  if (/^[0-9a-fA-F]{64}$/.test(material)) {
    cachedKey = Buffer.from(material, 'hex');
  } else {
    cachedKey = crypto.scryptSync(material, 'calculator-max-aes256-salt-v1', 32);
  }

  return cachedKey;
}

export function isEncryptedPayload(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Encrypts sensitive strings at rest using AES-256-GCM authenticated encryption.
 */
export function encryptText(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    return plaintext || '';
  }
  if (isEncryptedPayload(plaintext)) {
    return plaintext;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return (
    ENCRYPTION_PREFIX +
    [
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':')
  );
}

/**
 * Decrypts AES-256-GCM encrypted strings.
 * Legacy plaintext strings are returned unchanged for backward compatibility.
 */
export function decryptText(ciphertext: string): string {
  if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
    return ciphertext || '';
  }
  if (!isEncryptedPayload(ciphertext)) {
    return ciphertext;
  }

  try {
    const encoded = ciphertext.slice(ENCRYPTION_PREFIX.length);
    const parts = encoded.split(':');
    if (parts.length !== 3) {
      return '[Encrypted record unavailable]';
    }

    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');
    const encryptedData = Buffer.from(dataB64, 'base64url');

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '[Encrypted record unavailable]';
  }
}
