import { randomBytes, createHash } from "node:crypto";

// Excludes ambiguous characters (0/O, 1/I) since this is read off a car screen and typed
// on a phone/PC by hand.
const PAIRING_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generatePairingCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PAIRING_CODE_ALPHABET[bytes[i] % PAIRING_CODE_ALPHABET.length];
  }
  return out;
}

export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
