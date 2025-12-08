
// World-Class Security Service using Web Crypto API (AES-GCM)
// This ensures "Zero Knowledge" - we never store the raw password, only the derived key.

export class SecurityService {
  private static instance: SecurityService;
  private masterKey: CryptoKey | null = null;
  private salt: Uint8Array | null = null;

  private constructor() {}

  static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  // 1. Generate a salt for new users
  generateSalt(): string {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    this.salt = salt;
    return Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  loadSalt(hexSalt: string) {
    const match = hexSalt.match(/.{1,2}/g);
    if (match) {
        this.salt = new Uint8Array(match.map(byte => parseInt(byte, 16)));
    }
  }

  // 2. Derive a Key from the User's Password (PBKDF2)
  async deriveKey(password: string): Promise<boolean> {
    if (!this.salt) throw new Error("Salt not initialized");

    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    this.masterKey = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: this.salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false, // Key is non-extractable
      ["encrypt", "decrypt"]
    );

    return true;
  }

  // 3. Encrypt Data
  async encrypt(data: string): Promise<string> {
    if (!this.masterKey) throw new Error("Vault locked");

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    
    const encryptedContent = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      this.masterKey,
      enc.encode(data)
    );

    // Combine IV and Ciphertext for storage
    const encryptedArray = new Uint8Array(encryptedContent);
    const buf = new Uint8Array(iv.length + encryptedArray.length);
    buf.set(iv, 0);
    buf.set(encryptedArray, iv.length);

    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 4. Decrypt Data
  async decrypt(hexData: string): Promise<string | null> {
    if (!this.masterKey) throw new Error("Vault locked");

    try {
        const match = hexData.match(/.{1,2}/g);
        if (!match) return null;
        
        const dataArray = new Uint8Array(match.map(byte => parseInt(byte, 16)));
        const iv = dataArray.slice(0, 12);
        const ciphertext = dataArray.slice(12);

        const decryptedContent = await window.crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: iv
          },
          this.masterKey,
          ciphertext
        );

        const dec = new TextDecoder();
        return dec.decode(decryptedContent);
    } catch (e) {
        console.error("Decryption failed - likely wrong password", e);
        return null; // Signals wrong password
    }
  }

  isUnlocked(): boolean {
      return this.masterKey !== null;
  }
}

export const securityService = SecurityService.getInstance();
