import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const version = 'v1';

export class TokenEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenEncryptionError';
  }
}

function decodeKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) {
    throw new TokenEncryptionError('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
}

export function createTokenEncryptor(encodedKey: string) {
  const key = decodeKey(encodedKey);
  return {
    encryptionVersion: version,
    encrypt(plaintext: string) {
      if (!plaintext) throw new TokenEncryptionError('A token must not be empty.');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [
        version,
        iv.toString('base64url'),
        tag.toString('base64url'),
        encrypted.toString('base64url'),
      ].join('.');
    },
    decrypt(ciphertext: string) {
      const [cipherVersion, iv, tag, encrypted, ...extra] = ciphertext.split('.');
      if (cipherVersion !== version || !iv || !tag || !encrypted || extra.length) {
        throw new TokenEncryptionError('Unsupported encrypted token format.');
      }
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(encrypted, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        throw new TokenEncryptionError('Encrypted token could not be authenticated.');
      }
    },
  };
}
