import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// Get encryption key from environment or generate one
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (key) {
    return Buffer.from(key, 'hex');
  }
  
  // In development, use a static key (NOT for production)
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return crypto.scryptSync('dev-encryption-key', 'salt', KEY_LENGTH);
  }
  
  throw new Error('ENCRYPTION_KEY environment variable is required for production');
}

export class EncryptionService {
  private static key: Buffer | null = null;
  private static secondary: Buffer | null = null;

  private static getKey(): Buffer {
    if (!this.key) {
      this.key = getEncryptionKey();
    }
    return this.key;
  }

  private static keyFromHex(hex: string): Buffer {
    if (!hex || hex.length !== KEY_LENGTH * 2) {
      throw new Error('Invalid encryption key hex');
    }
    return Buffer.from(hex, 'hex');
  }

  static encrypt(plaintext: string): string {
    try {
      return this.encryptWithKey(plaintext, this.getKey().toString('hex'));
    } catch (error) {
      throw new Error('Encryption failed');
    }
  }

  static decrypt(encryptedData: string): string {
    try {
      return this.decryptWithKey(encryptedData, this.getKey().toString('hex'));
    } catch (error) {
      if (this.secondary) {
        try {
          return this.decryptWithKey(encryptedData, this.secondary.toString('hex'));
        } catch {}
      }
      throw new Error('Decryption failed');
    }
  }

  static generateDek(): string {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
  }

  static encryptEnvelope(plaintext: string): { ciphertext: string; dek: string } {
    const dek = this.generateDek();
    const ciphertext = this.encryptWithKey(plaintext, dek);
    const wrappedDek = this.encrypt(dek); // use KEK
    return { ciphertext, dek: wrappedDek };
  }

  static decryptEnvelope(ciphertext: string, wrappedDek: string): string {
    const dek = this.decrypt(wrappedDek); // decrypt() already does dual-key fallback
    return this.decryptWithKey(ciphertext, dek);
  }

  static rewrapDek(encryptedDek: string, oldKeyHex: string, newKeyHex: string): string {
    const dek = this.decryptWithKey(encryptedDek, oldKeyHex);
    return this.encryptWithKey(dek, newKeyHex);
  }

  /**
   * Rewrap a ciphertext that was encrypted directly with the KEK
   * (i.e., NOT envelope-encrypted with its own DEK).
   */
  static rewrapCiphertext(ciphertext: string, oldKeyHex: string, newKeyHex: string): string {
    const plaintext = this.decryptWithKey(ciphertext, oldKeyHex);
    return this.encryptWithKey(plaintext, newKeyHex);
  }

  static encryptWithKey(plaintext: string, keyHex: string): string {
    const key = this.keyFromHex(keyHex);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // iv || tag || ciphertext (all hex)
    return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex');
  }

  static decryptWithKey(encryptedData: string, keyHex: string): string {
    const key = this.keyFromHex(keyHex);
    const iv = Buffer.from(encryptedData.slice(0, IV_LENGTH * 2), 'hex');
    const tag = Buffer.from(encryptedData.slice(IV_LENGTH * 2, (IV_LENGTH + TAG_LENGTH) * 2), 'hex');
    const enc = Buffer.from(encryptedData.slice((IV_LENGTH + TAG_LENGTH) * 2), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return decrypted.toString('utf8');
  }

  // Used by the job once rotation has succeeded
  static setKey(newKeyHex: string): void {
    this.key = this.keyFromHex(newKeyHex);
    process.env.ENCRYPTION_KEY = newKeyHex;
  }

  static setSecondaryKey(nextKeyHex?: string | null): void {
    this.secondary = nextKeyHex ? this.keyFromHex(nextKeyHex) : null;
  }


  static async rotateKey(_oldKey: string, newKey: string): Promise<void> {
    this.setKey(newKey);
  }

  static generateKey(): string {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
  }
}