import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

// Finestra di validita' della firma - abbastanza larga da assorbire un orologio del
// dispositivo leggermente sfasato, abbastanza stretta da rendere inutile il replay di una
// richiesta intercettata anche solo pochi minuti dopo.
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;

// Verifica che POST /api/device/pairing/start provenga da un client che conosce la chiave
// HMAC condivisa (embedded, offuscata, nell'APK Android - vedi CloudApiClient.java) invece
// che essere chiamabile da chiunque con un vin/ivi_sn a caso. NON prova il possesso fisico
// di una specifica auto (la chiave e' la stessa per tutte le installazioni dell'app, quindi
// estraibile da chi decompila l'APK) - alza solo il costo dell'attacco da "una richiesta
// HTTP a caso" a "reverse engineering dell'app", e blocca il replay letterale di una
// richiesta catturata grazie alla finestra temporale. Vedi discussione in agent_log.md.
export function verifyPairingSignature(vin: string, timestamp: string, signature: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS) return false;

  // PAIRING_HMAC_SECRET e' la rappresentazione esadecimale dei 32 byte grezzi usati come
  // chiave HMAC - va decodificata prima dell'uso. Passarla a createHmac() come stringa
  // (bug della prima versione, trovato testando il pairing dal vivo il 2026-08-05) la
  // tratterebbe come i suoi 64 byte UTF-8 letterali invece dei 32 byte grezzi che
  // CloudApiClient.getPairingHmacKey() usa lato Android - stessa chiave "sulla carta",
  // interpretazioni diverse, firme che non avrebbero mai potuto combaciare.
  const secretKey = Buffer.from(env.pairingHmacSecret, "hex");
  const expectedHex = createHmac("sha256", secretKey)
    .update(`${vin}|${timestamp}`)
    .digest("hex");

  const expected = Buffer.from(expectedHex, "hex");
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
