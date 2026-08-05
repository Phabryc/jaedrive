package com.phabryc.jaedrive;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

// Carica sul backend cloud tutti i trip non ancora sincronizzati (TripDatabase.uploaded=0),
// uno alla volta in ordine cronologico - vedi SyncScheduler per come/quando viene
// accodato. Si ferma al primo errore di rete (WorkManager fara' ripartire l'intero worker
// piu' tardi con backoff, i trip gia' caricati in questo giro restano marcati com'erano
// prima di ripartire, grazie a markUploaded() chiamato subito dopo ogni singolo successo).
public class SyncWorker extends Worker {

    private static final String TAG = "JaeDrive-Sync";

    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        String token = Prefs.getCloudDeviceToken(ctx);
        if (token == null) return Result.success(); // mai associata, o disassociata nel frattempo

        // Heartbeat PRIMA di tentare qualunque upload (2026-08-04, vedi
        // cloud/ANDROID_SUBSCRIPTION_HANDSHAKE.md): un abbonamento non attivo blocca OGNI
        // upload con 403 lato server - chiederlo una volta qui evita di martellare /trips
        // una volta per ciascun viaggio in coda solo per beccare lo stesso 403 ripetuto, e
        // aggiorna subito lo snapshot locale (card CLOUD, gate premium status bar, popup
        // scadenza) anche in un giro senza nessun viaggio da caricare.
        try {
            CloudApiClient.SubscriptionInfo sub = CloudApiClient.heartbeat(token);
            if (sub != null) {
                Prefs.setSubscriptionSnapshot(ctx, sub.status, sub.tier, sub.expiresAt, sub.isActive);
                Prefs.setCloudSyncPaused(ctx, !sub.isActive);
                SubscriptionExpiryNotifier.checkAndNotify(ctx, sub);
                if (!sub.isActive) {
                    Log.i(TAG, "Sync in pausa: abbonamento non attivo");
                    // Non un errore da ritentare con backoff - ripartira' al prossimo
                    // trip chiuso o avvio di TrackingService, quando l'abbonamento potrebbe
                    // essere di nuovo attivo.
                    return Result.success();
                }
            }
        } catch (CloudApiClient.ApiException e) {
            if (e.httpCode == 409) {
                Log.w(TAG, "Device non piu' associato (409, heartbeat) - rimuovo l'associazione locale");
                Prefs.clearCloudPairingRemotely(ctx);
                return Result.success();
            }
            // Altri errori applicativi sull'heartbeat non sono fatali per questo giro - si
            // prova comunque l'upload sotto, che ha la propria gestione errori/retry.
            Log.w(TAG, "Heartbeat fallito, proseguo comunque con gli upload in coda: " + e);
        } catch (IOException | JSONException e) {
            Log.w(TAG, "Heartbeat fallito, proseguo comunque con gli upload in coda: " + e);
        }

        List<TripRecord> pending = TripDatabase.getInstance(ctx).getUnsyncedTrips();
        if (pending.isEmpty()) return Result.success();

        for (TripRecord r : pending) {
            try {
                JSONObject payload = buildPayload(ctx, r);
                String cloudTripId = CloudApiClient.uploadTrip(token, payload);
                TripDatabase.getInstance(ctx).markUploaded(r.id, cloudTripId);
            } catch (CloudApiClient.ApiException e) {
                if (e.httpCode == 409) {
                    // "Device is not paired to a vehicle" (vedi routes/device.ts POST
                    // /trips) - non un problema di rete transitorio: l'utente ha eliminato
                    // l'auto o l'intero account dal sito, il token che questo dispositivo
                    // conserva localmente non corrisponde piu' a nulla. Ripetere non
                    // risolverebbe mai nulla (continuerebbe a fallire per sempre) - meglio
                    // ripulire subito l'associazione locale, come dopo un RIMUOVI manuale,
                    // e avvisare l'utente alla prossima apertura dell'app (vedi
                    // Prefs.clearCloudPairingRemotely()/MainActivity.onCreate()).
                    Log.w(TAG, "Device non piu' associato (409) - rimuovo l'associazione locale");
                    Prefs.clearCloudPairingRemotely(ctx);
                    return Result.success();
                }
                if (e.httpCode == 403) {
                    // Abbonamento diventato non attivo esattamente tra l'heartbeat sopra e
                    // questo upload (o l'heartbeat stesso era fallito e si e' arrivati qui
                    // comunque) - stesso trattamento "pausa, non ritentare all'infinito".
                    Log.w(TAG, "Upload trip " + r.id + " bloccato: abbonamento non attivo (403)");
                    Prefs.setCloudSyncPaused(ctx, true);
                    return Result.success();
                }
                Log.w(TAG, "Upload trip " + r.id + " fallito, riprovo piu' tardi: " + e);
                return Result.retry();
            } catch (IOException e) {
                // Probabile problema di rete/server transitorio: i trip successivi
                // falliranno probabilmente allo stesso modo, meglio fermarsi e far ripartire
                // WorkManager piu' tardi (backoff) che martellare il server per ognuno.
                Log.w(TAG, "Upload trip " + r.id + " fallito, riprovo piu' tardi: " + e);
                return Result.retry();
            } catch (JSONException e) {
                // Payload malformato: un retry non lo aggiusterebbe mai - non blocchiamo gli
                // altri trip per questo, ma nemmeno lo segniamo come caricato.
                Log.e(TAG, "Payload non valido per trip " + r.id + ", salto: " + e);
            }
        }
        return Result.success();
    }

    // Static + Context esplicito (invece di un metodo d'istanza su getApplicationContext())
    // perche' serve anche a TrackingService per la spedizione periodica dello stato "in
    // corso" di un trip manuale non ancora resettato (vedi ManualTripComputer/
    // TrackingService.pushManualLiveProgress()), non solo al giro di upload di questo Worker.
    static JSONObject buildPayload(Context ctx, TripRecord r) throws JSONException {
        // Un'auto solo ICE non ha trazione elettrica: i segnali sottostanti restano IS_NULL
        // per sempre su di lei (vedi VehicleCatalog.EnergyCapability), ma per chiarezza non
        // ci affidiamo solo a quello - escludiamo esplicitamente questi campi dal payload.
        VehicleCatalog.EnergyCapability cap = VehicleCatalog.capabilityFor(Prefs.getVehiclePowertrain(ctx));
        boolean electric = cap != VehicleCatalog.EnergyCapability.ICE; // null (non ancora impostata) -> true, per non perdere dati potenzialmente validi

        JSONObject payload = new JSONObject();
        if (r.clientUuid != null) payload.put("clientUuid", r.clientUuid);
        payload.put("kind", kindFor(r));
        payload.put("startedAt", isoUtc(r.startTime));
        if (r.endTime > 0) payload.put("endedAt", isoUtc(r.endTime));
        if (r.label != null) payload.put("label", r.label);
        if (r.startLabel != null) payload.put("startLabel", r.startLabel);
        payload.put("km", r.kmDelta);
        if (r.litersDelta != null) payload.put("liters", r.litersDelta);
        if (r.avgConsumption != null) payload.put("avgConsumption", r.avgConsumption);
        // r.kmEv/r.kmHev NON sono piu' la fonte (vedi sotto, calcolati dalla traccia GPX) -
        // i campi restano sul TripRecord/TripDatabase solo per compatibilita' di schema
        // (stesso trattamento gia' riservato a startKm/endKm), sempre null per i trip
        // creati da qui in poi.

        // Solo i trip AUTO hanno una traccia GPX - da li' sia il file grezzo da allegare
        // (gpxRaw) sia il breakdown EV/serie/parallelo/altro e i km EV/HEV, ricalcolati
        // dagli stessi punti gia' usati per il pallino colorato nel dettaglio viaggio
        // locale (vedi EnergyFlowUtil.computeUploadBreakdown()/computeKmByBucket()).
        if (r.gpxPath != null) {
            File gpxFile = new File(r.gpxPath);
            if (gpxFile.exists()) {
                try {
                    payload.put("gpxRaw", new String(Files.readAllBytes(gpxFile.toPath())));
                } catch (IOException ignored) {
                    // Trip comunque caricabile senza traccia allegata, meglio di niente.
                }
                List<TripPoint> gpxPoints = GpxReader.readPoints(gpxFile);
                if (electric) {
                    double[] breakdown = EnergyFlowUtil.computeUploadBreakdown(gpxPoints);
                    if (breakdown != null) {
                        payload.put("pctEv", breakdown[0]);
                        payload.put("pctSeries", breakdown[1]);
                        payload.put("pctParallel", breakdown[2]);
                        payload.put("pctOther", breakdown[3]);
                    }
                    // Sostituisce il vecchio calcolo per differenza su ID_EV_MILEAGE/
                    // ID_HEV_MILEAGE (rimosso da TrackingService - confermato sul campo
                    // 2026-08-01 che ID_HEV_MILEAGE restituisce sempre l'odometro totale,
                    // non una distanza specifica per la modalita' ibrida).
                    double[] kmByBucket = EnergyFlowUtil.computeKmByBucket(gpxPoints);
                    if (kmByBucket != null) {
                        payload.put("kmEv", kmByBucket[0]);
                        payload.put("kmHev", kmByBucket[1]);
                    }
                }
                // Il drive mode (ECO/NORMAL/SPORT) si applica a qualunque motorizzazione,
                // non solo alle ibride - vedi la tabella dati/motorizzazione in memoria.
                double[] driveModeBreakdown = computeDriveModeBreakdown(gpxPoints);
                if (driveModeBreakdown != null) {
                    payload.put("pctEco", driveModeBreakdown[0]);
                    payload.put("pctNormal", driveModeBreakdown[1]);
                    payload.put("pctSport", driveModeBreakdown[2]);
                }
            }
        }
        return payload;
    }

    // % di campioni in ciascuna modalita' di guida (0/1/2=ECO/NORMAL/SPORT) sui punti della
    // traccia GPX - stesso schema di EnergyFlowUtil.computeUploadBreakdown() ma per il drive
    // mode invece del bucket energyFlow. Null se non c'e' nessun campione valido (es. traccia
    // registrata prima che questo campo esistesse).
    private static double[] computeDriveModeBreakdown(List<TripPoint> points) {
        int eco = 0, normal = 0, sport = 0, known = 0;
        for (TripPoint p : points) {
            if (p.driveMode < 0) continue;
            known++;
            if (p.driveMode == 0) eco++;
            else if (p.driveMode == 1) normal++;
            else if (p.driveMode == 2) sport++;
        }
        if (known == 0) return null;
        return new double[]{100.0 * eco / known, 100.0 * normal / known, 100.0 * sport / known};
    }

    // Una volta chiuso, un trip manuale e' un trip manuale - lo slot A/B che l'ha generato
    // non e' una categoria a se' (la UI dell'app stessa non li distingue nel filtro Storico,
    // solo AUTO vs MANUAL - vedi MainActivity.currentTrackFilter). La distinzione A/B resta
    // solo nell'etichetta testuale del trip (rinominabile), non nel "kind" usato per
    // categorizzare/filtrare lato cloud - vedi cloud/DESIGN.md §10.
    private static String kindFor(TripRecord r) {
        return TripRecord.TYPE_AUTO.equals(r.type) ? "auto" : "manual";
    }

    private static String isoUtc(long millis) {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(millis);
    }
}
