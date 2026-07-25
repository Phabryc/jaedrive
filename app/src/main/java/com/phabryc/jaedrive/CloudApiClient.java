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

// Client HTTP per le rotte /api/device/* del backend cloud (vedi cloud/DESIGN.md §9) -
// HttpURLConnection + org.json invece di una libreria nuova, entrambi gia' disponibili
// nell'SDK Android senza dipendenze aggiuntive (stesso approccio usato per il reverse
// geocoding Nominatim in TrackingService). Tutti i metodi sono bloccanti: vanno SEMPRE
// chiamati da un thread in background (vedi SyncWorker, o il dialogo di pairing in
// MainActivity che usa un proprio Thread/Handler).
public class CloudApiClient {

    private static final String BASE_URL = "https://jaedrive.com";
    private static final int TIMEOUT_MS = 15000;

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
        JSONObject body = new JSONObject();
        body.put("vin", vin);
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

    public static void heartbeat(String deviceToken) throws IOException, JSONException {
        postJson("/api/device/heartbeat", deviceToken, new JSONObject());
    }

    public static class OwnerProfile {
        public final String firstName;
        public final String lastName;
        public final String email;
        public final String photoUrl; // nullable, URL esterno (es. foto Google) - vedi CLOUD card

        OwnerProfile(String firstName, String lastName, String email, String photoUrl) {
            this.firstName = firstName;
            this.lastName = lastName;
            this.email = email;
            this.photoUrl = photoUrl;
        }
    }

    // Nome/cognome/email/foto dell'account a cui e' associata quest'auto - mostrati nella
    // card CLOUD di Impostazioni (vedi MainActivity.refreshCloudSection()).
    public static OwnerProfile getOwnerProfile(String deviceToken) throws IOException, JSONException {
        JSONObject resp = getJson("/api/device/owner", deviceToken);
        return new OwnerProfile(
            resp.optString("firstName", null),
            resp.optString("lastName", null),
            resp.optString("email", null),
            resp.isNull("photoUrl") ? null : resp.optString("photoUrl", null));
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
            throw new IOException("HTTP " + code + ": " + msg);
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
