package com.phabryc.jaedrive;

import android.content.Context;

import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

// Punto d'ingresso per far partire SyncWorker - chiamato subito dopo ogni insertTrip()
// riuscito (TrackingService per gli AUTO, ManualTripComputer per i MANUAL) cosi' un trip
// appena chiuso parte verso il cloud il prima possibile, ma sopravvive comunque a
// mancanza di rete/riavvii grazie a WorkManager (constraint + backoff, non un semplice
// Thread "spara e spera").
public class SyncScheduler {

    private static final String UNIQUE_WORK_NAME = "jaedrive-trip-sync";

    public static void enqueueSync(Context ctx) {
        if (!Prefs.isCloudPaired(ctx)) return; // niente token, niente da fare

        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(SyncWorker.class)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, OneTimeWorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
            .build();

        // APPEND: se un sync e' gia' in coda/in corso, questo se ne accoda un altro subito
        // dopo invece di scartarlo o duplicarne uno parallelo - importante perche' ogni
        // chiamata rappresenta "e' comparso un nuovo trip da mandare", non va perso anche
        // se ne arriva una seconda mentre la prima e' ancora in volo.
        WorkManager.getInstance(ctx.getApplicationContext())
            .enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request);
    }
}
