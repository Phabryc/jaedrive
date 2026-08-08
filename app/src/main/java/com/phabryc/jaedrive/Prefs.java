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
    // VIN automobilistico reale (campo separato da synced_vin/ivi.sn, richiesta esplicita
    // utente 2026-08-08) - vedi MainActivity.resolveAndSyncRealVin(). REAL_VIN e' l'ultimo
    // valore risolto localmente via getprop; SYNCED_REAL_VIN e' l'ultimo gia' confermato sul
    // cloud, per evitare PATCH ripetute quando non e' cambiato nulla.
    private static final String KEY_REAL_VIN = "real_vin";
    private static final String KEY_SYNCED_REAL_VIN = "synced_real_vin";
    private static final String KEY_CLOUD_UNPAIRED_REMOTELY = "cloud_unpaired_remotely";
    // Ultimo livello carburante (%) visto da TrackingService, persistito ad ogni lettura -
    // sopravvive al riavvio del processo/servizio cosi' la lettura successiva (vicina alla
    // prossima accensione) puo' confrontarsi con "l'ultimo valore prima dello spegnimento"
    // per rilevare un rifornimento - vedi TrackingService.checkFuelRefillOnStartup().
    private static final String KEY_LAST_FUEL_PCT_SEEN = "last_fuel_pct_seen";
    private static final String KEY_REGEN_POPUP_ENABLED = "regen_popup_enabled";
    private static final String KEY_REFUEL_POPUP_ENABLED = "refuel_popup_enabled";
    private static final String KEY_STATUS_BAR_ENABLED = "status_bar_enabled";
    private static final String KEY_BATTERY_OPT_REQUESTED = "battery_opt_requested";
    // Ultimo snapshot abbonamento noto (2026-08-04, vedi ANDROID_SUBSCRIPTION_HANDSHAKE.md) -
    // aggiornato da CloudApiClient.heartbeat() (SyncWorker) e getOwnerProfile() (card CLOUD in
    // Impostazioni), qualunque dei due arrivi prima. Persistito (non solo in memoria) cosi'
    // la UI e i gate premium (status bar) hanno subito un valore plausibile anche prima del
    // primo giro di rete di questa sessione, invece di dover assumere "FREE" alla cieca.
    private static final String KEY_SUB_STATUS = "sub_status";
    private static final String KEY_SUB_TIER = "sub_tier";
    private static final String KEY_SUB_EXPIRES_AT = "sub_expires_at";
    private static final String KEY_SUB_IS_ACTIVE = "sub_is_active";
    // Backup della configurazione utente dei 3 switch PREMIUM (2026-08-05, richiesta esplicita
    // utente; esteso 2026-08-07 anche a clearCloudPairing()) - scritto PRIMA di forzarli a
    // false sia da setSubscriptionSnapshot() (sospensione temporanea) sia da
    // clearCloudPairing() (disassociazione), cosi' alla prossima conferma di un abbonamento
    // davvero attivo (stesso pairing riattivato o pairing nuovo) si puo' ripristinare
    // esattamente cio' che l'utente aveva scelto invece di lasciare tutto spento. La sola
    // PRESENZA di queste chiavi (non il loro valore) e' usata come flag "backup gia' fatto,
    // in attesa di ripristino" - vedi setSubscriptionSnapshot()/clearCloudPairing().
    private static final String KEY_STATUS_BAR_ENABLED_BACKUP = "status_bar_enabled_backup";
    private static final String KEY_REGEN_POPUP_ENABLED_BACKUP = "regen_popup_enabled_backup";
    private static final String KEY_REFUEL_POPUP_ENABLED_BACKUP = "refuel_popup_enabled_backup";
    // Vero se l'ultimo tentativo di sync (heartbeat o upload) ha visto l'abbonamento non
    // attivo - usato per lo stato "bloccato" dell'iconcina cloud nello Storico, distinto dal
    // normale "in coda" grigio (vedi MainActivity.buildTripRowStatsRow()).
    private static final String KEY_SYNC_PAUSED = "sync_paused";
    // Valore di expiresAt per cui l'utente ha gia' premuto "Non ricordare piu'" sul popup di
    // scadenza imminente (vedi SubscriptionExpiryNotifier) - confrontato col nuovo expiresAt
    // ad ogni check, non un semplice booleano: se l'utente rinnova (nuovo expiresAt diverso),
    // il popup torna eleggibile per il nuovo ciclo invece di restare silenziato per sempre.
    private static final String KEY_SUB_EXPIRY_WARNING_DISMISSED_FOR = "sub_expiry_warning_dismissed_for";

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
    // log per non sprecare spazio/risorse quando non servono. Default OFF (cambiato
    // 2026-08-02, richiesta esplicita): la sezione Sviluppo in Impostazioni e' ormai nascosta
    // di default (vedi MainActivity.devSectionUnlocked), coerente con un utente finale non
    // piu' solo l'autore in fase di reverse-engineering attiva.
    public static boolean isDebugModeEnabled(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_DEBUG_MODE_ENABLED, false);
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

    // BUG TROVATO SUL CAMPO (2026-08-05, segnalato dall'utente): questo metodo rimuoveva solo
    // i dati di sottoscrizione/pairing, MAI i 3 switch PREMIUM (status bar/popup rigenerazione/
    // popup rifornimento) - un utente poteva associare l'auto una volta con un abbonamento
    // qualsiasi, accendere i 3 switch, disassociare, e riassociare/disassociare all'infinito
    // continuando ad avere le funzioni PREMIUM gratis in locale, perche' isSubscriptionActive()
    // tornava false ma gli switch restavano "true" per sempre (nessuno li rimetteva a false
    // fuori da setSubscriptionSnapshot(), mai chiamato da qui).
    //
    // BUG TROVATO SUL CAMPO #2 (2026-08-07, segnalato dall'utente): il fix sopra azzerava gli
    // switch qui SENZA MAI fare un backup (a differenza di setSubscriptionSnapshot(), usato per
    // una sospensione temporanea) - un utente che disassociava e riassociava la stessa
    // auto/account perdeva per sempre la propria scelta sui 3 switch, dovendoli riaccendere a
    // mano ogni volta, anche in un semplice ciclo disassocia/riassocia con lo stesso account
    // sempre attivo. La preoccupazione originale ("un account diverso non deve ereditare le
    // preferenze del precedente") non e' in realta' un problema di sicurezza: tutti e 3 i
    // trigger reali ricontrollano SEMPRE Prefs.isSubscriptionActive() a runtime, in aggiunta
    // allo switch (difesa in profondita', vedi TrackingService.refreshStatusBar() e il check
    // regen/rifornimento) - un valore di backup ripristinato resta comunque bloccato finche' un
    // abbonamento davvero attivo non lo sblocca. Ora il backup si fa QUI PRIMA di azzerare
    // (stesso schema/guard di setSubscriptionSnapshot(): solo se non gia' presente, per non
    // sovrascrivere un backup di una sospensione temporanea non ancora ripristinato) - il
    // ripristino avviene da solo al prossimo setSubscriptionSnapshot(..., isActive=true), che
    // sia dopo una riattivazione dello stesso abbonamento o dopo una nuova associazione.
    public static void clearCloudPairing(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit()
            .remove(KEY_CLOUD_DEVICE_TOKEN)
            .remove(KEY_CLOUD_VEHICLE_ID)
            .remove(KEY_SUB_STATUS)
            .remove(KEY_SUB_TIER)
            .remove(KEY_SUB_EXPIRES_AT)
            .remove(KEY_SUB_IS_ACTIVE)
            .remove(KEY_SYNC_PAUSED)
            .remove(KEY_SUB_EXPIRY_WARNING_DISMISSED_FOR);
        if (!prefs.contains(KEY_STATUS_BAR_ENABLED_BACKUP)) {
            editor.putBoolean(KEY_STATUS_BAR_ENABLED_BACKUP, prefs.getBoolean(KEY_STATUS_BAR_ENABLED, false));
            editor.putBoolean(KEY_REGEN_POPUP_ENABLED_BACKUP, prefs.getBoolean(KEY_REGEN_POPUP_ENABLED, true));
            editor.putBoolean(KEY_REFUEL_POPUP_ENABLED_BACKUP, prefs.getBoolean(KEY_REFUEL_POPUP_ENABLED, true));
        }
        editor.putBoolean(KEY_STATUS_BAR_ENABLED, false);
        editor.putBoolean(KEY_REGEN_POPUP_ENABLED, false);
        editor.putBoolean(KEY_REFUEL_POPUP_ENABLED, false);
        editor.apply();
    }

    // Scritto insieme da CloudApiClient.heartbeat() (SyncWorker, sfondo) e getOwnerProfile()
    // (card CLOUD, primo piano) - qualunque dei due arrivi per ultimo vince, sono lo stesso
    // dato letto da endpoint diversi. isActive gia' calcolato lato server (tiene conto anche
    // di expiresAt scaduto), non ricalcolato qui.
    public static void setSubscriptionSnapshot(Context ctx, String status, String tier, String expiresAt, boolean isActive) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit()
            .putString(KEY_SUB_STATUS, status)
            .putString(KEY_SUB_TIER, tier)
            .putString(KEY_SUB_EXPIRES_AT, expiresAt)
            .putBoolean(KEY_SUB_IS_ACTIVE, isActive);
        if (!isActive) {
            // Funzioni PREMIUM (2026-08-04, richiesta esplicita utente: status bar, popup
            // rigenerazione, popup rifornimento) - si spengono da sole quando l'abbonamento
            // non e' (piu') attivo, invece di restare "accesi" nell'interruttore mentre la
            // funzione vera e propria resta comunque bloccata altrove (vedi
            // TrackingService.refreshStatusBar()/MainActivity.refreshPremiumGatedSwitches()).
            // Scritto qui, unico punto in cui arriva un nuovo stato abbonamento (heartbeat in
            // SyncWorker o getOwnerProfile in MainActivity), cosi' vale per entrambe le fonti
            // senza duplicare la logica.
            //
            // Backup PRIMA di azzerare (2026-08-05, richiesta esplicita utente) - solo se non
            // gia' fatto per questa scadenza (contains() come flag "gia' salvato": altrimenti
            // ogni heartbeat/refresh successivo mentre resta inattivo sovrascriverebbe il
            // backup con i valori gia' azzerati qui sotto, perdendo per sempre la vera scelta
            // dell'utente). Gli switch sono disabilitati in UI mentre l'abbonamento non e'
            // attivo (vedi MainActivity.refreshPremiumGatedSwitches()), quindi non possono
            // cambiare "sotto" a questo backup finche' non si ripristina.
            if (!prefs.contains(KEY_STATUS_BAR_ENABLED_BACKUP)) {
                editor.putBoolean(KEY_STATUS_BAR_ENABLED_BACKUP, prefs.getBoolean(KEY_STATUS_BAR_ENABLED, false));
                editor.putBoolean(KEY_REGEN_POPUP_ENABLED_BACKUP, prefs.getBoolean(KEY_REGEN_POPUP_ENABLED, true));
                editor.putBoolean(KEY_REFUEL_POPUP_ENABLED_BACKUP, prefs.getBoolean(KEY_REFUEL_POPUP_ENABLED, true));
            }
            editor.putBoolean(KEY_STATUS_BAR_ENABLED, false);
            editor.putBoolean(KEY_REGEN_POPUP_ENABLED, false);
            editor.putBoolean(KEY_REFUEL_POPUP_ENABLED, false);
        } else if (prefs.contains(KEY_STATUS_BAR_ENABLED_BACKUP)) {
            // Riattivazione: ripristina esattamente cio' che l'utente aveva scelto prima della
            // scadenza, poi rimuove il backup - la prossima scadenza ne salvera' uno nuovo,
            // non trovera' piu' quello vecchio gia' consumato qui.
            editor.putBoolean(KEY_STATUS_BAR_ENABLED, prefs.getBoolean(KEY_STATUS_BAR_ENABLED_BACKUP, false));
            editor.putBoolean(KEY_REGEN_POPUP_ENABLED, prefs.getBoolean(KEY_REGEN_POPUP_ENABLED_BACKUP, true));
            editor.putBoolean(KEY_REFUEL_POPUP_ENABLED, prefs.getBoolean(KEY_REFUEL_POPUP_ENABLED_BACKUP, true));
            editor.remove(KEY_STATUS_BAR_ENABLED_BACKUP);
            editor.remove(KEY_REGEN_POPUP_ENABLED_BACKUP);
            editor.remove(KEY_REFUEL_POPUP_ENABLED_BACKUP);
        }
        editor.apply();
    }

    public static String getSubscriptionStatus(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SUB_STATUS, "FREE");
    }

    public static String getSubscriptionTier(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SUB_TIER, "STANDARD");
    }

    public static String getSubscriptionExpiresAt(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SUB_EXPIRES_AT, null);
    }

    // Default false apposta (fail-closed): finche' non arriva almeno un heartbeat/owner
    // riuscito in questa installazione, ogni funzione a gate premium (vedi StatusBarOverlay in
    // TrackingService.refreshStatusBar()) resta disattivata invece di assumere "attivo" alla
    // cieca.
    public static boolean isSubscriptionActive(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_SUB_IS_ACTIVE, false);
    }

    public static boolean isCloudSyncPaused(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_SYNC_PAUSED, false);
    }

    public static void setCloudSyncPaused(Context ctx, boolean paused) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_SYNC_PAUSED, paused).apply();
    }

    public static String getSubExpiryWarningDismissedFor(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SUB_EXPIRY_WARNING_DISMISSED_FOR, null);
    }

    public static void setSubExpiryWarningDismissedFor(Context ctx, String expiresAt) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SUB_EXPIRY_WARNING_DISMISSED_FOR, expiresAt).apply();
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

    // VIN automobilistico reale - persistenza locale (richiesta esplicita utente
    // 2026-08-08), indipendente dal fatto che l'auto sia gia' associata al cloud o meno.
    public static String getRealVin(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_REAL_VIN, null);
    }

    public static void setRealVin(Context ctx, String vin) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_REAL_VIN, vin).apply();
    }

    // Ultimo VIN reale gia' confermato sul cloud - evita PATCH ripetute (vedi
    // MainActivity.resolveAndSyncRealVin()), stesso ruolo di getSyncedVin() per ivi.sn.
    public static String getSyncedRealVin(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SYNCED_REAL_VIN, null);
    }

    public static void setSyncedRealVin(Context ctx, String vin) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SYNCED_REAL_VIN, vin).apply();
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

    // Barra di stato in background (2026-08-02, vedi StatusBarOverlay) - default OFF a
    // differenza dei popup sopra: e' una finestra SEMPRE visibile mentre l'app e' in
    // background (non un avviso occasionale), meglio che l'utente la accenda esplicitamente
    // la prima volta invece di trovarsela addosso senza preavviso dopo un aggiornamento.
    public static boolean isStatusBarEnabled(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_STATUS_BAR_ENABLED, false);
    }

    public static void setStatusBarEnabled(Context ctx, boolean enabled) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_STATUS_BAR_ENABLED, enabled).apply();
    }

    // Su questa ROM custom non c'e' un'app Impostazioni raggiungibile che possa risolvere
    // ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (stesso limite gia' documentato altrove per
    // altri intent di sistema) - confermato sul campo 2026-08-02: l'intent "riesce" a partire
    // (nessuna ActivityNotFoundException) ma finisce in un gestore generico che mostra solo
    // un toast di sistema "cannot handle operation", mai il vero dialogo di esenzione. Non ha
    // senso ritentare ad ogni apertura app (solo un toast fastidioso ripetuto) - una volta
    // tentato, non si richiede piu' finche' l'utente non reinstalla l'app.
    public static boolean hasRequestedBatteryOptExemption(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_BATTERY_OPT_REQUESTED, false);
    }

    public static void setRequestedBatteryOptExemption(Context ctx) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_BATTERY_OPT_REQUESTED, true).apply();
    }
}
