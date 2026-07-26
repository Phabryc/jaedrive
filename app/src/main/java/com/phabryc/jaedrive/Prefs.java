package com.phabryc.jaedrive;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.UUID;

// Preferenze utente esposte nella sezione Impostazioni: unita' di misura (solo di
// visualizzazione, i dati restano salvati internamente in km/litri) e interruttore
// per la registrazione della traccia GPS.
public class Prefs {

    private static final String PREFS = "jaedrive_prefs";
    private static final String KEY_UNIT_DISTANCE_MI = "unit_distance_mi";
    private static final String KEY_UNIT_CONSUMPTION_GAL = "unit_consumption_gal";
    private static final String KEY_GPS_TRACK_ENABLED = "gps_track_enabled";
    private static final String KEY_DEBUG_MODE_ENABLED = "debug_mode_enabled";
    private static final String KEY_CLOUD_DEVICE_TOKEN = "cloud_device_token";
    private static final String KEY_CLOUD_VEHICLE_ID = "cloud_vehicle_id";
    private static final String KEY_DEVICE_GUID = "device_guid";
    private static final String KEY_VEHICLE_BRAND = "vehicle_brand";
    private static final String KEY_VEHICLE_MODEL = "vehicle_model";
    private static final String KEY_VEHICLE_POWERTRAIN = "vehicle_powertrain";
    private static final String KEY_SYNCED_VIN = "synced_vin";

    public static boolean isDistanceMiles(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_UNIT_DISTANCE_MI, false);
    }

    public static void setDistanceMiles(Context ctx, boolean miles) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_UNIT_DISTANCE_MI, miles).apply();
    }

    public static boolean isConsumptionGallons(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_UNIT_CONSUMPTION_GAL, false);
    }

    public static void setConsumptionGallons(Context ctx, boolean gallons) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_UNIT_CONSUMPTION_GAL, gallons).apply();
    }

    // Letto direttamente da TrackingService prima di avviare la registrazione GPS di ogni
    // viaggio: se disattivato, il viaggio resta tracciato ai fini del consumo (km/litri via
    // VDB) ma non produce una traccia GPX.
    public static boolean isGpsTrackEnabled(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_GPS_TRACK_ENABLED, true);
    }

    public static void setGpsTrackEnabled(Context ctx, boolean enabled) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_GPS_TRACK_ENABLED, enabled).apply();
    }

    // Letto sia da MainActivity (buffer/log a schermo) sia da TrackingService (log su file,
    // log per-viaggio allegato al TripRecord): se disattivato, evita di scrivere/accumulare
    // log per non sprecare spazio/risorse quando non servono. Default ON: il progetto e'
    // ancora in fase di reverse-engineering attiva, i log restano utili finche' non si
    // disattivano esplicitamente da qui.
    public static boolean isDebugModeEnabled(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_DEBUG_MODE_ENABLED, true);
    }

    public static void setDebugModeEnabled(Context ctx, boolean enabled) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_DEBUG_MODE_ENABLED, enabled).apply();
    }

    // Token del dispositivo assegnato dal server cloud alla fine del pairing (vedi
    // CloudApiClient/MainActivity, dialogo di associazione in Impostazioni) - null finche'
    // l'auto non e' mai stata associata a un account. E' il bearer usato per ogni chiamata
    // /api/device/* successiva (upload trip, heartbeat) - vedi SyncWorker.
    public static String getCloudDeviceToken(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CLOUD_DEVICE_TOKEN, null);
    }

    public static boolean isCloudPaired(Context ctx) {
        return getCloudDeviceToken(ctx) != null;
    }

    // vehicleId e' solo per mostrare qualcosa di riconoscibile nella card "Cloud" di
    // Impostazioni (nessun altro uso lato client) - salvato insieme al token alla fine di
    // un pairing riuscito.
    public static void setCloudPairing(Context ctx, String deviceToken, String vehicleId) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_CLOUD_DEVICE_TOKEN, deviceToken)
            .putString(KEY_CLOUD_VEHICLE_ID, vehicleId)
            .apply();
    }

    public static String getCloudVehicleId(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CLOUD_VEHICLE_ID, null);
    }

    public static void clearCloudPairing(Context ctx) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(KEY_CLOUD_DEVICE_TOKEN)
            .remove(KEY_CLOUD_VEHICLE_ID)
            .apply();
    }

    // Identificativo stabile generato localmente la prima volta che serve, usato come
    // fallback del VIN per il pairing quando l'utente non lo conosce/non vuole inserirlo a
    // mano (vedi MainActivity, dialogo di pairing) - da' comunque un'identita' univoca
    // all'auto lato server, anche se non e' il vero VIN. Persistito una sola volta: non
    // sopravvive a una disinstallazione dell'app, ma non serve che lo faccia (i trip locali
    // sparirebbero comunque insieme al resto del database in quel caso).
    public static synchronized String getOrCreateDeviceGuid(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String guid = p.getString(KEY_DEVICE_GUID, null);
        if (guid == null) {
            guid = UUID.randomUUID().toString();
            p.edit().putString(KEY_DEVICE_GUID, guid).apply();
        }
        return guid;
    }

    // Marca/modello/motorizzazione impostati dall'onboarding obbligatorio (vedi
    // MainActivity.showVehicleOnboardingDialog()/VehicleCatalog) - sostituisce il vecchio
    // tentativo di rilevazione automatica via VDB (ID_MODEL_CODE/ID_BRAND, ritirato perche'
    // mai affidabile). isVehicleInfoSet() decide se mostrare l'onboarding all'avvio.
    public static boolean isVehicleInfoSet(Context ctx) {
        return getVehicleBrand(ctx) != null && getVehicleModel(ctx) != null && getVehiclePowertrain(ctx) != null;
    }

    public static String getVehicleBrand(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_VEHICLE_BRAND, null);
    }

    public static String getVehicleModel(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_VEHICLE_MODEL, null);
    }

    public static String getVehiclePowertrain(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_VEHICLE_POWERTRAIN, null);
    }

    public static void setVehicleInfo(Context ctx, String brand, String model, String powertrain) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_VEHICLE_BRAND, brand)
            .putString(KEY_VEHICLE_MODEL, model)
            .putString(KEY_VEHICLE_POWERTRAIN, powertrain)
            .apply();
    }

    // Ultimo VIN inviato con successo al cloud (dal pairing stesso, o da un aggiornamento
    // successivo - vedi MainActivity.syncVinIfNeeded()) - null per le installazioni/pairing
    // precedenti a questa feature. Serve solo a evitare PATCH ripetute quando il VIN
    // risolto (Settings.Global "ivi.sn") e' gia' quello che il cloud ha; NON e' il VIN
    // stesso, che resta risolto a ogni avvio da tryReadIviSn()/tryReadStandardVin()/VDB.
    public static String getSyncedVin(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SYNCED_VIN, null);
    }

    public static void setSyncedVin(Context ctx, String vin) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SYNCED_VIN, vin).apply();
    }
}
