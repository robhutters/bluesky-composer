// lib/crypto.ts
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Derive an AES-GCM key from a passphrase using PBKDF2
export async function deriveKey(passphrase: string, salt: Uint8Array) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function getRandomBytes(length = 12) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function encryptText(plaintext: string, passphrase: string) {
  const salt = getRandomBytes(16);
  const iv = getRandomBytes(12); // AES-GCM recommended IV size
  const key = await deriveKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(plaintext)
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
    salt,
  };
}

export async function decryptText(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  salt: Uint8Array,
  passphrase: string
) {
  const key = await deriveKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return textDecoder.decode(plaintext);
}

// Helper to convert between byte arrays and Base64 for JSON/DB transport
export function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}
export function fromBase64(b64: string) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
