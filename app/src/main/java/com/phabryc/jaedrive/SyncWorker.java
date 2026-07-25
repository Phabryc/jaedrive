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

        List<TripRecord> pending = TripDatabase.getInstance(ctx).getUnsyncedTrips();
        if (pending.isEmpty()) return Result.success();

        for (TripRecord r : pending) {
            try {
                JSONObject payload = buildPayload(r);
                String cloudTripId = CloudApiClient.uploadTrip(token, payload);
                TripDatabase.getInstance(ctx).markUploaded(r.id, cloudTripId);
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

    private JSONObject buildPayload(TripRecord r) throws JSONException {
        JSONObject payload = new JSONObject();
        payload.put("kind", kindFor(r));
        payload.put("startedAt", isoUtc(r.startTime));
        if (r.endTime > 0) payload.put("endedAt", isoUtc(r.endTime));
        if (r.label != null) payload.put("label", r.label);
        payload.put("km", r.kmDelta);
        if (r.litersDelta != null) payload.put("liters", r.litersDelta);
        if (r.avgConsumption != null) payload.put("avgConsumption", r.avgConsumption);

        // Solo i trip AUTO hanno una traccia GPX - da li' sia il file grezzo da allegare
        // (gpxRaw) sia il breakdown EV/serie/parallelo/altro, ricalcolato dagli stessi punti
        // gia' usati per il pallino colorato nel dettaglio viaggio locale (vedi
        // EnergyFlowUtil.computeUploadBreakdown()).
        if (r.gpxPath != null) {
            File gpxFile = new File(r.gpxPath);
            if (gpxFile.exists()) {
                try {
                    payload.put("gpxRaw", new String(Files.readAllBytes(gpxFile.toPath())));
                } catch (IOException ignored) {
                    // Trip comunque caricabile senza traccia allegata, meglio di niente.
                }
                double[] breakdown = EnergyFlowUtil.computeUploadBreakdown(GpxReader.readPoints(gpxFile));
                if (breakdown != null) {
                    payload.put("pctEv", breakdown[0]);
                    payload.put("pctSeries", breakdown[1]);
                    payload.put("pctParallel", breakdown[2]);
                    payload.put("pctOther", breakdown[3]);
                }
            }
        }
        return payload;
    }

    private String kindFor(TripRecord r) {
        if (TripRecord.TYPE_AUTO.equals(r.type)) return "auto";
        return "manual_" + (ManualTripComputer.SLOT_B.equals(r.manualSlot) ? "b" : "a");
    }

    private String isoUtc(long millis) {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(millis);
    }
}
