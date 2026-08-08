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

        // REPLACE (2026-08-07, prima era APPEND_OR_REPLACE - BUG TROVATO SUL CAMPO, segnalato
        // dall'utente): APPEND accoda il nuovo lavoro come DIPENDENTE di uno gia' in coda -
        // se un tentativo precedente era finito in Result.retry() (rete assente, 403/abbonamento
        // non attivo trattato come pausa, ecc.) e stava aspettando il proprio backoff
        // esponenziale (fino a ore), il sync appena richiesto qui restava bloccato dietro,
        // in attesa che quel vecchio tentativo scadesse da solo - invisibile all'utente, che
        // vedeva i trip in coda partire solo al prossimo trigger "fortunato" (es. la chiusura
        // del viaggio successivo, che ha coinciso per caso con la scadenza del backoff). Il
        // caso concreto segnalato: subito dopo una riassociazione, i trip gia' in coda da
        // prima non partivano finche' non finiva il viaggio successivo. REPLACE e' sicuro qui
        // (a differenza di un caso con payload specifico per singola richiesta) perche'
        // SyncWorker.doWork() rilegge SEMPRE la lista completa e aggiornata dei trip non
        // sincronizzati da TripDatabase ad ogni esecuzione - non passiamo mai id di trip
        // specifici nella request, quindi sostituire un tentativo vecchio/bloccato con uno
        // nuovo non perde mai nulla, anzi lo fa ripartire subito.
        WorkManager.getInstance(ctx.getApplicationContext())
            .enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.REPLACE, request);
    }
}
