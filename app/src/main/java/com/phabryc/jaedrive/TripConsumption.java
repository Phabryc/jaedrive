package com.phabryc.jaedrive;

import android.content.Context;
import android.content.SharedPreferences;

// Consumo dell'ultimo viaggio aperto/chiuso dal trigger a marcia (P/non-P) - stessi
// confini della traccia GPS. Persistito su SharedPreferences: sopravvive anche se il
// processo viene ucciso e riavviato mentre l'app non e' aperta (TrackingService gira
// in background indipendentemente da MainActivity).
//
// Sia km che litri sono ACCUMULATORI (vedi addKm()/addLiters()), non baseline-snapshot:
// ID_TRIP si azzera da solo ad ogni accensione del motore (motivo del cambio per i km),
// e SUM_FUEL (il segnale carburante) puo' essere azzerato dall'utente in qualsiasi
// momento tramite il computer di bordo NATIVO dell'auto, indipendentemente da JaeDrive -
// un reset a meta' sessione avrebbe fatto sparire il consumo residuo con un semplice
// calcolo "attuale - baseline alla partenza". TrackingService somma il delta di ogni
// lettura (gia' corretto per un eventuale reset del contatore) direttamente qui.
public class TripConsumption {

    private static final String PREFS = "jaedrive_prefs";
    private static final String KEY_ACTIVE = "trip_active";
    private static final String KEY_START_TIME = "trip_start_time";
    private static final String KEY_KM_ACCUM = "trip_km_accum";
    private static final String KEY_LITERS_ACCUM = "trip_liters_accum";
    // Rinominata (era "trip_last_km_delta"): la vecchia chiave era gia' persistita come
    // INT sui dispositivi con almeno un viaggio concluso prima di questo refactor (quando
    // kmDelta era ancora int). SharedPreferences ricorda il tipo per ogni chiave - leggere
    // un INT con getFloat() lancia ClassCastException non catturata, crash immediato al
    // primo avvio (renderTripConsumption() gira senza delay subito dopo onCreate).
    private static final String KEY_LAST_KM_DELTA = "trip_last_km_delta_v2";
    private static final String KEY_LAST_KM_DELTA_LEGACY = "trip_last_km_delta";
    private static final String KEY_LAST_LITERS = "trip_last_liters";
    private static final String KEY_LAST_AVG = "trip_last_avg";

    // Migra il valore dalla vecchia chiave INT a quella nuova FLOAT (invece di
    // abbandonarlo, cosi' l'ultimo viaggio concluso prima dell'aggiornamento resta
    // visibile) e rimuove la vecchia chiave, cosi' la migrazione avviene una volta sola
    // (le chiamate successive trovano p.contains(...) false e non fanno nulla). Va
    // chiamata il prima possibile ad ogni avvio, prima di qualsiasi getLastKmDelta() -
    // vedi MainActivity.onCreate()/TrackingService.onCreate().
    public static synchronized void migrateLegacyKeys(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!p.contains(KEY_LAST_KM_DELTA_LEGACY)) return;
        try {
            int oldValue = p.getInt(KEY_LAST_KM_DELTA_LEGACY, 0);
            p.edit()
                .putFloat(KEY_LAST_KM_DELTA, (float) oldValue)
                .remove(KEY_LAST_KM_DELTA_LEGACY)
                .apply();
        } catch (ClassCastException e) {
            // Non dovrebbe succedere (la vecchia chiave era sempre INT), ma se per
            // qualche motivo non lo e' piu' ci limitiamo a scartare la vecchia chiave
            // senza propagare il crash.
            p.edit().remove(KEY_LAST_KM_DELTA_LEGACY).apply();
        }
    }

    public static synchronized void startTrip(Context ctx) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_ACTIVE, true)
            .putLong(KEY_START_TIME, System.currentTimeMillis())
            .putFloat(KEY_KM_ACCUM, 0f)
            .putFloat(KEY_LITERS_ACCUM, 0f)
            .apply();
    }

    public static long getStartTime(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_START_TIME, -1);
    }

    // Chiamati da TrackingService ad ogni lettura ID_TRIP/SUM_FUEL con il delta rispetto
    // alla lettura precedente (gia' corretto per un eventuale reset del contatore - vedi
    // TrackingService.handleTripKm()/handleFuel()). Non fanno nulla se il viaggio non e' attivo.
    public static synchronized void addKm(Context ctx, double delta) {
        if (delta <= 0 || !isActive(ctx)) return;
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        float total = p.getFloat(KEY_KM_ACCUM, 0f) + (float) delta;
        p.edit().putFloat(KEY_KM_ACCUM, total).apply();
    }

    public static synchronized void addLiters(Context ctx, double delta) {
        if (delta <= 0 || !isActive(ctx)) return;
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        float total = p.getFloat(KEY_LITERS_ACCUM, 0f) + (float) delta;
        p.edit().putFloat(KEY_LITERS_ACCUM, total).apply();
    }

    public static boolean isActive(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ACTIVE, false);
    }

    public static double getKmDelta(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getFloat(KEY_KM_ACCUM, 0f);
    }

    public static double getLitersDelta(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getFloat(KEY_LITERS_ACCUM, 0f);
    }

    public static Double computeAverage(Context ctx) {
        double kmDelta = getKmDelta(ctx);
        double liters = getLitersDelta(ctx);
        if (kmDelta <= 0 || liters <= 0) return null;
        return kmDelta / liters;
    }

    public static synchronized void endTrip(Context ctx) {
        double kmDelta = getKmDelta(ctx);
        double liters = getLitersDelta(ctx);
        Double avg = computeAverage(ctx);
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        e.putBoolean(KEY_ACTIVE, false);
        e.putFloat(KEY_LAST_KM_DELTA, (float) kmDelta);
        e.putFloat(KEY_LAST_LITERS, (float) liters);
        // BUG trovato: quando avg e' null (es. un viaggio a consumo di carburante
        // trascurabile/zero, plausibile per un ibrido con molta guida EV) la chiave non
        // veniva ne' scritta ne' rimossa - il valore VECCHIO di un viaggio precedente
        // (magari corrotto da prima del fix sui valori spuri di ID_TRIP) restava
        // per sempre in Dashboard, anche se lo Storico per QUEL viaggio mostrava
        // correttamente "nessun dato". Ora la chiave viene sempre rimossa quando non
        // c'e' una media valida, cosi' getLastAverage() torna correttamente null.
        if (avg != null) {
            e.putFloat(KEY_LAST_AVG, avg.floatValue());
        } else {
            e.remove(KEY_LAST_AVG);
        }
        e.apply();
    }

    // Risultati dell'ultimo viaggio concluso, persistiti: visibili anche riaprendo
    // l'app dopo che il viaggio e' finito ad app chiusa.
    public static double getLastKmDelta(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getFloat(KEY_LAST_KM_DELTA, 0f);
    }

    public static Double getLastLiters(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return p.contains(KEY_LAST_LITERS) ? (double) p.getFloat(KEY_LAST_LITERS, 0f) : null;
    }

    public static Double getLastAverage(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return p.contains(KEY_LAST_AVG) ? (double) p.getFloat(KEY_LAST_AVG, 0f) : null;
    }
}
