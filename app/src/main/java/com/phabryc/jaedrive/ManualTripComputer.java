package com.phabryc.jaedrive;

import android.content.Context;
import android.content.SharedPreferences;

// Trip computer manuale: DUE slot indipendenti (Trip A / Trip B), ciascuno accumula km e
// litri consumati dall'ultimo reset esplicito dell'utente su quello slot specifico
// (indipendente dall'apertura/chiusura di un viaggio via marcia e indipendente l'uno
// dall'altro). Ogni slot ha anche un'etichetta personalizzabile (default "Trip A"/"Trip B").
// Persistito su SharedPreferences: sopravvive a riavvii di processo/dispositivo.
// Aggiornato in continuo da TrackingService (gira in background anche ad app chiusa).
//
// Sia km che litri sono ACCUMULATORI (vedi addKm()/addLiters()), non baseline-snapshot:
// ID_TRIP si azzera da solo ad ogni accensione del motore, e SUM_FUEL (il segnale
// carburante) puo' essere azzerato dall'utente in qualsiasi momento tramite il computer
// di bordo NATIVO dell'auto (indipendentemente da JaeDrive) - un reset a meta' sessione
// avrebbe fatto sparire il consumo residuo con un semplice calcolo "attuale - baseline al
// reset". TrackingService somma il delta di ogni lettura (gia' corretto per un eventuale
// reset del contatore) direttamente nell'accumulatore di ENTRAMBI gli slot, cosi' ognuno
// continua a crescere indipendentemente da quando e' stato azzerato.
public class ManualTripComputer {

    public static final String SLOT_A = "A";
    public static final String SLOT_B = "B";

    private static final String PREFS = "jaedrive_prefs";
    private static final String KEY_ACCUM_KM_PREFIX = "manual_accum_km_";
    private static final String KEY_ACCUM_LITERS_PREFIX = "manual_accum_liters_";
    private static final String KEY_RESET_TIME_PREFIX = "manual_reset_time_";
    private static final String KEY_LABEL_PREFIX = "manual_label_";
    // Chiavi del vecchio modello a baseline-snapshot (prima del passaggio ad accumulatore
    // per ID_TRIP/SUM_FUEL) - il refactor ha smesso di leggerle/scriverle ma non le ha
    // MAI rimosse esplicitamente, quindi il progresso di uno slot gia' in corso a quel
    // momento e' ancora recuperabile - vedi migrateLegacyIfNeeded().
    private static final String KEY_RESET_KM_PREFIX_LEGACY = "manual_reset_km_";
    private static final String KEY_RESET_FUEL_PREFIX_LEGACY = "manual_reset_fuel_";
    private static final double FUEL_RAW_SCALE_LEGACY = 0.1;

    public static String defaultLabel(Context ctx, String slot) {
        return ctx.getString(SLOT_A.equals(slot) ? R.string.trip_a_default : R.string.trip_b_default);
    }

    public static String getLabel(Context ctx, String slot) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_LABEL_PREFIX + slot, defaultLabel(ctx, slot));
    }

    public static void setLabel(Context ctx, String slot, String label) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_LABEL_PREFIX + slot, label).apply();
    }

    // Nessun dato VDB necessario per il reset: azzera semplicemente gli accumulatori
    // dello slot (dopo averli archiviati in TripDatabase se c'era qualcosa da salvare).
    public static synchronized void reset(Context ctx, String slot) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();

        String kmKey = KEY_ACCUM_KM_PREFIX + slot;
        String litersKey = KEY_ACCUM_LITERS_PREFIX + slot;
        double kmDelta = p.getFloat(kmKey, 0f);
        double litersDelta = p.getFloat(litersKey, 0f);
        long oldTime = p.getLong(KEY_RESET_TIME_PREFIX + slot, now);

        // Se lo slot aveva gia' accumulato qualcosa, il reset ne segna la chiusura:
        // lo archiviamo in TripDatabase prima di azzerare, con l'etichetta corrente
        // dello slot come riferimento.
        if (kmDelta > 0) {
            Double litersForRecord = litersDelta > 0 ? litersDelta : null;
            Double avg = (litersForRecord != null) ? kmDelta / litersForRecord : null;
            try {
                TripRecord record = new TripRecord(
                    TripRecord.TYPE_MANUAL, oldTime, now, 0, 0, kmDelta, 0, 0,
                    litersForRecord, avg, null, null, getLabel(ctx, slot));
                record.manualSlot = slot;
                TripDatabase.getInstance(ctx).insertTrip(record);
                SyncScheduler.enqueueSync(ctx);
            } catch (Exception ignored) {
                // Il computer manuale resta comunque coerente anche se il salvataggio
                // dello storico fallisse: non e' un dato critico per il calcolo live.
            }
        }

        // L'etichetta personalizzata (se ce n'era una) torna al nome di default ("Trip
        // A"/"Trip B") - il periodo appena chiuso l'aveva gia' come riferimento
        // nell'archiviazione sopra, un nuovo periodo che inizia non deve ereditarla.
        p.edit()
            .putFloat(kmKey, 0f)
            .putFloat(litersKey, 0f)
            .putLong(KEY_RESET_TIME_PREFIX + slot, now)
            .remove(KEY_LABEL_PREFIX + slot)
            .apply();
    }

    // Chiamati da TrackingService ad ogni lettura ID_TRIP/SUM_FUEL con il delta rispetto
    // alla lettura precedente (gia' corretto per un eventuale reset del contatore) -
    // sommati SEMPRE ad entrambi gli slot, indipendentemente dal viaggio automatico a marcia.
    public static synchronized void addKm(Context ctx, double delta) {
        if (delta <= 0) return;
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor e = p.edit();
        for (String slot : new String[]{SLOT_A, SLOT_B}) {
            String key = KEY_ACCUM_KM_PREFIX + slot;
            e.putFloat(key, p.getFloat(key, 0f) + (float) delta);
        }
        e.apply();
    }

    public static synchronized void addLiters(Context ctx, double delta) {
        if (delta <= 0) return;
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor e = p.edit();
        for (String slot : new String[]{SLOT_A, SLOT_B}) {
            String key = KEY_ACCUM_LITERS_PREFIX + slot;
            e.putFloat(key, p.getFloat(key, 0f) + (float) delta);
        }
        e.apply();
    }

    public static double getKmDelta(Context ctx, String slot) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getFloat(KEY_ACCUM_KM_PREFIX + slot, 0f);
    }

    public static double getLitersDelta(Context ctx, String slot) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getFloat(KEY_ACCUM_LITERS_PREFIX + slot, 0f);
    }

    public static Double computeAverage(Context ctx, String slot) {
        double kmDelta = getKmDelta(ctx, slot);
        double liters = getLitersDelta(ctx, slot);
        if (kmDelta <= 0 || liters <= 0) return null;
        return kmDelta / liters;
    }

    // Istante dell'ultimo reset dello slot (o "ora" se non e' mai stato resettato, cioe'
    // il primo avvio) - usato da MainActivity per mostrare il periodo di un trip manuale
    // ancora aperto nello Storico.
    public static long getResetTime(Context ctx, String slot) {
        long now = System.currentTimeMillis();
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_RESET_TIME_PREFIX + slot, now);
    }

    // Ricostruisce il delta gia' accumulato da uno slot col vecchio modello (baseline al
    // reset vs. lettura corrente di ID_TOTAL_MILEAGE/SUM_FUEL, stessa formula usata dal
    // vecchio getKmDelta()/getLitersDelta()) e lo versa nel nuovo accumulatore, poi
    // rimuove le vecchie chiavi. Va chiamata con una lettura CORRENTE valida di entrambe
    // le fonti (vedi TrackingService.tryMigrateManualLegacy()) - idempotente: se le
    // vecchie chiavi non ci sono piu' (gia' migrato, o slot mai usato prima d'ora) non fa nulla.
    public static synchronized void migrateLegacyIfNeeded(Context ctx, int currentTotalMileageKm, int currentFuelRaw) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor e = p.edit();
        boolean changed = false;
        for (String slot : new String[]{SLOT_A, SLOT_B}) {
            String legacyKmKey = KEY_RESET_KM_PREFIX_LEGACY + slot;
            if (p.contains(legacyKmKey)) {
                int oldBaselineKm = p.getInt(legacyKmKey, currentTotalMileageKm);
                double deltaKm = currentTotalMileageKm - oldBaselineKm;
                if (deltaKm > 0) {
                    String accumKey = KEY_ACCUM_KM_PREFIX + slot;
                    e.putFloat(accumKey, p.getFloat(accumKey, 0f) + (float) deltaKm);
                }
                e.remove(legacyKmKey);
                changed = true;
            }
            String legacyFuelKey = KEY_RESET_FUEL_PREFIX_LEGACY + slot;
            if (p.contains(legacyFuelKey)) {
                int oldBaselineFuel = p.getInt(legacyFuelKey, currentFuelRaw);
                double deltaLiters = (currentFuelRaw - oldBaselineFuel) * FUEL_RAW_SCALE_LEGACY;
                if (deltaLiters > 0) {
                    String accumLitersKey = KEY_ACCUM_LITERS_PREFIX + slot;
                    e.putFloat(accumLitersKey, p.getFloat(accumLitersKey, 0f) + (float) deltaLiters);
                }
                e.remove(legacyFuelKey);
                changed = true;
            }
        }
        if (changed) e.apply();
    }
}
