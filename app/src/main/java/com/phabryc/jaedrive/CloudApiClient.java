package com.phabryc.jaedrive;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.NoSuchAlgorithmException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

// Client HTTP per le rotte /api/device/* del backend cloud (vedi cloud/DESIGN.md §9) -
// HttpURLConnection + org.json invece di una libreria nuova, entrambi gia' disponibili
// nell'SDK Android senza dipendenze aggiuntive (stesso approccio usato per il reverse
// geocoding Nominatim in TrackingService). Tutti i metodi sono bloccanti: vanno SEMPRE
// chiamati da un thread in background (vedi SyncWorker, o il dialogo di pairing in
// MainActivity che usa un proprio Thread/Handler).
public class CloudApiClient {

    private static final String BASE_URL = "https://jaedrive.com";
    private static final int TIMEOUT_MS = 15000;

    // Chiave HMAC condivisa col server (env PAIRING_HMAC_SECRET, vedi
    // cloud/server/src/lib/pairingAuth.ts) per firmare POST /api/device/pairing/start -
    // l'endpoint e' volutamente non autenticato (e' il punto di ingresso del pairing, prima
    // che esista un device token), quindi senza questa firma sarebbe chiamabile da chiunque
    // conosca il VIN/ivi_sn di un'auto NON PROPRIA per "occupare" quel VIN prima del vero
    // proprietario (vedi agent_log.md per l'analisi completa). Offuscata con lo stesso schema
    // XOR gia' usato in JaeDriveProbe per la password dello zip - onestamente non e' vera
    // sicurezza (chi decompila l'APK la ritrova), alza solo il costo dell'attacco da "una
    // richiesta HTTP a caso" a "reverse engineering dell'app".
    private static final int[] PAIRING_KEY_OBFUSCATED = {
        0xE8, 0x04, 0x79, 0x02, 0x08, 0x04, 0xD9, 0x65,
        0xE1, 0x26, 0xCF, 0xD4, 0x78, 0xFA, 0xE3, 0xAF,
        0xAE, 0x4F, 0x6F, 0x04, 0xCF, 0x6B, 0x51, 0x85,
        0x19, 0x74, 0x9E, 0x88, 0x1E, 0x63, 0x21, 0x5F
    };
    private static final int PAIRING_KEY_XOR = 0x7C;

    private static byte[] getPairingHmacKey() {
        byte[] key = new byte[PAIRING_KEY_OBFUSCATED.length];
        for (int i = 0; i < PAIRING_KEY_OBFUSCATED.length; i++) {
            key[i] = (byte) (PAIRING_KEY_OBFUSCATED[i] ^ PAIRING_KEY_XOR);
        }
        return key;
    }

    private static String hmacSha256Hex(byte[] key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] raw = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(raw.length * 2);
            for (byte b : raw) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException | java.security.InvalidKeyException e) {
            // HmacSHA256 e' sempre disponibile nell'SDK Android, e la chiave e' sempre a
            // lunghezza fissa valida - non dovrebbe mai succedere in pratica.
            throw new RuntimeException(e);
        }
    }

    public static class PairingStart {
        public final String pairingRequestId;
        public final String code;

        PairingStart(String pairingRequestId, String code) {
            this.pairingRequestId = pairingRequestId;
            this.code = code;
        }
    }

    public static class PairingStatus {
        public final String status; // pending | claimed | expired
        public final String deviceToken; // non-null solo la prima volta che arriva "claimed"

        PairingStatus(String status, String deviceToken) {
            this.status = status;
            this.deviceToken = deviceToken;
        }
    }

    public static PairingStart pairingStart(String vin, String appVersion) throws IOException, JSONException {
        String timestamp = String.valueOf(System.currentTimeMillis());
        String signature = hmacSha256Hex(getPairingHmacKey(), vin + "|" + timestamp);

        JSONObject body = new JSONObject();
        body.put("vin", vin);
        body.put("timestamp", timestamp);
        body.put("signature", signature);
        if (appVersion != null) body.put("appVersion", appVersion);
        JSONObject resp = postJson("/api/device/pairing/start", null, body);
        return new PairingStart(resp.getString("pairingRequestId"), resp.getString("code"));
    }

    public static PairingStatus pairingStatus(String pairingRequestId) throws IOException, JSONException {
        JSONObject resp = getJson("/api/device/pairing/status/" + pairingRequestId, null);
        String status = resp.getString("status");
        String token = resp.has("deviceToken") && !resp.isNull("deviceToken") ? resp.getString("deviceToken") : null;
        return new PairingStatus(status, token);
    }

    // payload costruito dal chiamante (vedi SyncWorker.buildPayload()) secondo lo schema
    // in cloud/DESIGN.md §10. Ritorna il tripId assegnato dal server.
    public static String uploadTrip(String deviceToken, JSONObject payload) throws IOException, JSONException {
        JSONObject resp = postJson("/api/device/trips", deviceToken, payload);
        return resp.getString("tripId");
    }

    // Stato abbonamento cloud (vedi cloud/ANDROID_SUBSCRIPTION_HANDSHAKE.md) - status/tier
    // sono stringhe letterali dal server (FREE|PREMIUM, STANDARD|GARAGE) invece di un enum:
    // solo mostrate/persistite, mai confrontate con logica complessa lato client, un enum
    // aggiungerebbe solo un punto di mappatura da tenere sincrono col server senza reale
    // beneficio. isActive e' gia' calcolato lato server (tiene conto di expiresAt scaduto).
    public static class SubscriptionInfo {
        public final String status;
        public final String tier;
        public final String expiresAt; // ISO 8601, nullable (mai scaduto/mai stato premium)
        public final boolean isActive;

        SubscriptionInfo(String status, String tier, String expiresAt, boolean isActive) {
            this.status = status;
            this.tier = tier;
            this.expiresAt = expiresAt;
            this.isActive = isActive;
        }
    }

    // Condiviso da heartbeat() e getOwnerProfile(), stesso oggetto "subscription" annidato in
    // entrambe le risposte. Null solo se il campo manca del tutto (non dovrebbe succedere con
    // un server aggiornato, ma un client vecchio/nuovo scollegati non devono mai crashare per
    // questo - vedi SyncWorker, tratta null come "nessuna informazione, non toccare lo stato").
    private static SubscriptionInfo parseSubscription(JSONObject resp) throws JSONException {
        if (!resp.has("subscription") || resp.isNull("subscription")) return null;
        JSONObject s = resp.getJSONObject("subscription");
        return new SubscriptionInfo(
            s.optString("status", "FREE"),
            s.optString("tier", "STANDARD"),
            s.isNull("expiresAt") ? null : s.optString("expiresAt", null),
            s.optBoolean("isActive", false));
    }

    // Ritorna lo stato abbonamento invece di scartare la risposta (era void fino al
    // 2026-08-04): e' l'UNICO punto che permette a SyncWorker di accorgersi che un
    // abbonamento scaduto e' tornato attivo (o viceversa) senza dover aprire Impostazioni -
    // vedi SyncWorker.doWork().
    public static SubscriptionInfo heartbeat(String deviceToken) throws IOException, JSONException {
        JSONObject resp = postJson("/api/device/heartbeat", deviceToken, new JSONObject());
        return parseSubscription(resp);
    }

    public static class OwnerProfile {
        public final String firstName;
        public final String lastName;
        public final String email;
        public final String photoUrl; // nullable, URL esterno (es. foto Google) - vedi CLOUD card
        public final SubscriptionInfo subscription; // nullable, vedi parseSubscription()

        OwnerProfile(String firstName, String lastName, String email, String photoUrl, SubscriptionInfo subscription) {
            this.firstName = firstName;
            this.lastName = lastName;
            this.email = email;
            this.photoUrl = photoUrl;
            this.subscription = subscription;
        }
    }

    // Nome/cognome/email/foto/abbonamento dell'account a cui e' associata quest'auto -
    // mostrati nella card CLOUD di Impostazioni (vedi MainActivity.refreshCloudSection()).
    public static OwnerProfile getOwnerProfile(String deviceToken) throws IOException, JSONException {
        JSONObject resp = getJson("/api/device/owner", deviceToken);
        return new OwnerProfile(
            resp.optString("firstName", null),
            resp.optString("lastName", null),
            resp.optString("email", null),
            resp.isNull("photoUrl") ? null : resp.optString("photoUrl", null),
            parseSubscription(resp));
    }

    // Cancellazione di un singolo viaggio dal cloud - chiamata solo se l'utente conferma
    // esplicitamente "elimina anche dal cloud" dopo una cancellazione locale (vedi
    // MainActivity.confirmDeleteSelectedTrips()).
    public static void deleteTrip(String deviceToken, String cloudTripId) throws IOException {
        deleteRequest("/api/device/trips/" + cloudTripId, deviceToken);
    }

    // Cancellazione dell'intera auto dal cloud (cascata su viaggi/dispositivi lato server) -
    // chiamata solo se l'utente conferma esplicitamente durante la disassociazione.
    public static void deleteVehicle(String deviceToken) throws IOException {
        deleteRequest("/api/device/vehicle", deviceToken);
    }

    // Marca/modello/motorizzazione dall'onboarding obbligatorio (vedi VehicleCatalog,
    // MainActivity.showVehicleOnboardingDialog()) - chiamata subito se l'auto e' gia'
    // associata, altrimenti rimandata al primo pairing riuscito (vedi
    // MainActivity.syncVehicleInfoIfNeeded()).
    public static void updateVehicleInfo(String deviceToken, String brand, String model, String powertrain) throws IOException, JSONException {
        JSONObject body = new JSONObject();
        body.put("brand", brand);
        body.put("model", model);
        body.put("powertrain", powertrain);
        HttpURLConnection conn = open("/api/device/vehicle", "PATCH", deviceToken);
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        readResponse(conn);
    }

    // Aggiornamento del solo VIN (route condivisa con updateVehicleInfo(), vedi routes/device.ts
    // PATCH /vehicle - accetta un body parziale) - usato da MainActivity.syncVinIfNeeded() per
    // correggere sul cloud un'auto associata in passato con VIN manuale o con l'identificativo
    // di fallback (Prefs.getOrCreateDeviceGuid()), non appena il VIN reale risulta disponibile
    // via Settings.Global("ivi.sn").
    public static void updateVehicleVin(String deviceToken, String vin) throws IOException, JSONException {
        JSONObject body = new JSONObject();
        body.put("vin", vin);
        HttpURLConnection conn = open("/api/device/vehicle", "PATCH", deviceToken);
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        readResponse(conn);
    }

    private static void deleteRequest(String path, String bearerToken) throws IOException {
        HttpURLConnection conn = open(path, "DELETE", bearerToken);
        try {
            readResponse(conn);
        } catch (JSONException e) {
            // Risposta 204 senza corpo, o corpo non-JSON inatteso - non e' un errore per una
            // DELETE, l'unica cosa che conta e' che readResponse non abbia gia' lanciato per
            // uno status HTTP non-2xx.
        }
    }

    private static JSONObject postJson(String path, String bearerToken, JSONObject body) throws IOException, JSONException {
        HttpURLConnection conn = open(path, "POST", bearerToken);
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        return readResponse(conn);
    }

    private static JSONObject getJson(String path, String bearerToken) throws IOException, JSONException {
        HttpURLConnection conn = open(path, "GET", bearerToken);
        return readResponse(conn);
    }

    private static HttpURLConnection open(String path, String method, String bearerToken) throws IOException {
        URL url = new URL(BASE_URL + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setRequestProperty("Content-Type", "application/json");
        if (bearerToken != null) conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
        return conn;
    }

    // IOException con lo status HTTP allegato - permette al chiamante (vedi
    // MainActivity.refreshVinFromCar()) di distinguere un errore applicativo preciso (es. 409,
    // VIN gia' in uso da un'altra auto) da un generico errore di rete, senza dover fare
    // parsing fragile del messaggio testuale.
    public static class ApiException extends IOException {
        public final int httpCode;

        ApiException(int httpCode, String message) {
            super(message);
            this.httpCode = httpCode;
        }
    }

    private static JSONObject readResponse(HttpURLConnection conn) throws IOException, JSONException {
        int code = conn.getResponseCode();
        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        String body = readAll(is);
        if (code < 200 || code >= 300) {
            String msg = body;
            try {
                msg = new JSONObject(body).optString("error", body);
            } catch (Exception ignored) {
                // Corpo non-JSON (es. errore 502 da un proxy) - usiamo il testo grezzo.
            }
            throw new ApiException(code, msg);
        }
        return body.isEmpty() ? new JSONObject() : new JSONObject(body);
    }

    private static String readAll(InputStream is) throws IOException {
        if (is == null) return "";
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
        return bos.toString("UTF-8");
    }
}
