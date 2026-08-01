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
    private static final String KEY_UNIT_CONSUMPTION_L100KM = "unit_consumption_l100km";
    private static final String KEY_GPS_TRACK_ENABLED = "gps_track_enabled";
    private static final String KEY_DEBUG_MODE_ENABLED = "debug_mode_enabled";
    private static final String KEY_CLOUD_DEVICE_TOKEN = "cloud_device_token";
    private static final String KEY_CLOUD_VEHICLE_ID = "cloud_vehicle_id";
    private static final String KEY_DEVICE_GUID = "device_guid";
    private static final String KEY_VEHICLE_BRAND = "vehicle_brand";
    private static final String KEY_VEHICLE_MODEL = "vehicle_model";
    private static final String KEY_VEHICLE_POWERTRAIN = "vehicle_powertrain";
    private static final String KEY_SYNCED_VIN = "synced_vin";
    private static final String KEY_CLOUD_UNPAIRED_REMOTELY = "cloud_unpaired_remotely";
    // Ultimo livello carburante (%) visto da TrackingService, persistito ad ogni lettura -
    // sopravvive al riavvio del processo/servizio cosi' la lettura successiva (vicina alla
    // prossima accensione) puo' confrontarsi con "l'ultimo valore prima dello spegnimento"
    // per rilevare un rifornimento - vedi TrackingService.checkFuelRefillOnStartup().
    private static final String KEY_LAST_FUEL_PCT_SEEN = "last_fuel_pct_seen";
    private static final String KEY_REGEN_POPUP_ENABLED = "regen_popup_enabled";
    private static final String KEY_REFUEL_POPUP_ENABLED = "refuel_popup_enabled";

    public static boolean isDistanceMiles(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_UNIT_DISTANCE_MI, false);
    }

    public static void setDistanceMiles(Context ctx, boolean miles) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_UNIT_DISTANCE_MI, miles).apply();
    }

    // false (default) = "percorrenza/litro" (km/l o mi/l), true = "litri/100 unita' distanza"
    // (L/100km o L/100mi) - solo formato di visualizzazione del consumo, l'unita' di distanza
    // dentro il rapporto segue comunque isDistanceMiles() sopra (vedi UnitFormatter). Niente
    // piu' galloni, ritirati su richiesta esplicita 2026-08-02: il carburante resta sempre
    // in litri.
    public static boolean isConsumptionL100km(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_UNIT_CONSUMPTION_L100KM, false);
    }

    public static void setConsumptionL100km(Context ctx, boolean l100km) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_UNIT_CONSUMPTION_L100KM, l100km).apply();
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

    // Disassociazione "a sorpresa" lato server (SyncWorker riceve 409 "Device is not paired
    // to a vehicle" durante un upload - vedi routes/device.ts) - succede quando l'utente
    // elimina l'auto o l'intero account dal sito, non tramite il bottone RIMUOVI dell'app
    // stessa (quello chiama clearCloudPairing() direttamente, l'utente sa gia' cosa sta
    // succedendo). Alza un flag "one-shot" che MainActivity consuma alla prossima apertura
    // per mostrare un avviso esplicito, invece di lasciare che l'auto smetta di sincronizzare
    // in silenzio senza che nessuno se ne accorga.
    public static void clearCloudPairingRemotely(Context ctx) {
        clearCloudPairing(ctx);
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_CLOUD_UNPAIRED_REMOTELY, true)
            .apply();
    }

    // "Consuma" il flag (lo legge e lo azzera subito) cosi' l'avviso in MainActivity compare
    // una volta sola, non ad ogni apertura successiva dell'app.
    public static boolean consumeCloudUnpairedRemotelyFlag(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean flag = p.getBoolean(KEY_CLOUD_UNPAIRED_REMOTELY, false);
        if (flag) p.edit().putBoolean(KEY_CLOUD_UNPAIRED_REMOTELY, false).apply();
        return flag;
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
    // successivo - vedi MainActivity.refreshVinFromCar()) - null per le installazioni/pairing
    // precedenti a questa feature. Serve solo a evitare PATCH ripetute quando il VIN
    // risolto (system property "sys.vehicle.hardware.vin.code") e' gia' quello che il cloud
    // ha; NON e' il VIN stesso, che resta risolto a ogni avvio da tryReadRealVin()/
    // tryReadStandardVin()/VDB.
    public static String getSyncedVin(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SYNCED_VIN, null);
    }

    public static void setSyncedVin(Context ctx, String vin) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SYNCED_VIN, vin).apply();
    }

    // -1 (nessuna lettura ancora persistita, es. primissimo avvio in assoluto) invece di 0:
    // 0% carburante e' un valore reale possibile, non va confuso con "sconosciuto".
    public static float getLastFuelPctSeen(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getFloat(KEY_LAST_FUEL_PCT_SEEN, -1f);
    }

    public static void setLastFuelPctSeen(Context ctx, float pct) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putFloat(KEY_LAST_FUEL_PCT_SEEN, pct).apply();
    }

    // Attivi di default (true) - l'utente li disattiva esplicitamente dalle Impostazioni
    // se non li vuole, vedi MainActivity.setupImpostazioni()/TrackingService.
    public static boolean isRegenPopupEnabled(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_REGEN_POPUP_ENABLED, true);
    }

    public static void setRegenPopupEnabled(Context ctx, boolean enabled) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_REGEN_POPUP_ENABLED, enabled).apply();
    }

    public static boolean isRefuelPopupEnabled(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_REFUEL_POPUP_ENABLED, true);
    }

    public static void setRefuelPopupEnabled(Context ctx, boolean enabled) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_REFUEL_POPUP_ENABLED, enabled).apply();
    }
}
