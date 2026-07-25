package com.phabryc.jaedrive;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

// Storico dei viaggi (automatici GPS + manuali), sostituisce il precedente elenco
// basato sui soli file .gpx in storage interno: ogni riga tiene insieme i dati
// riassuntivi del viaggio (km/litri/media) e i path dei file allegati (traccia GPX
// e log, solo per i viaggi automatici - i manuali non hanno una traccia GPS propria).
public class TripDatabase extends SQLiteOpenHelper {

    private static final String DB_NAME = "jaedrive_trips.db";
    // v2: aggiunta start_label (indirizzo di partenza, reverse-geocoded come la
    // destinazione gia' esistente - solo AUTO). A differenza del cambio di tipo di
    // km_delta (stessa colonna, SQLite tollera il tipo diverso via affinita'), questa e'
    // una colonna NUOVA: serve una vera ALTER TABLE per i database gia' sul dispositivo,
    // altrimenti query/insert che la referenziano fallirebbero su un'installazione non pulita.
    // v3: aggiunte uploaded/cloud_trip_id (stato sincronizzazione col cloud, vedi SyncWorker).
    // v4: aggiunta client_uuid (chiave di idempotenza upload lato server, vedi
    // cloud/server/src/routes/device.ts) - backfillata per i trip gia' esistenti in
    // onUpgrade() perche' SQLite non ha una funzione UUID() per farlo in un solo ALTER/UPDATE.
    // v5: aggiunti km_ev/km_hev (split reale EV/HEV per differenza sui contatori ID_EV_
    // MILEAGE/ID_HEV_MILEAGE, vedi TrackingService) - dati upload-only per il cloud, mai
    // mostrati nella UI dell'app in auto, nullable per i trip gia' esistenti/senza baseline.
    private static final int DB_VERSION = 5;
    private static final String TABLE = "trips";

    private static TripDatabase instance;

    public static synchronized TripDatabase getInstance(Context ctx) {
        if (instance == null) {
            instance = new TripDatabase(ctx.getApplicationContext());
        }
        return instance;
    }

    private TripDatabase(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE " + TABLE + " (" +
            "id INTEGER PRIMARY KEY AUTOINCREMENT," +
            "type TEXT NOT NULL," +
            "start_time INTEGER NOT NULL," +
            "end_time INTEGER NOT NULL," +
            "start_km INTEGER NOT NULL," +
            "end_km INTEGER NOT NULL," +
            "km_delta REAL NOT NULL," +
            "start_fuel_raw INTEGER NOT NULL," +
            "end_fuel_raw INTEGER NOT NULL," +
            "liters_delta REAL," +
            "avg_consumption REAL," +
            "gpx_path TEXT," +
            "log_path TEXT," +
            "label TEXT," +
            "start_label TEXT," +
            "uploaded INTEGER NOT NULL DEFAULT 0," +
            "cloud_trip_id TEXT," +
            "manual_slot TEXT," +
            "client_uuid TEXT," +
            "km_ev REAL," +
            "km_hev REAL)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE " + TABLE + " ADD COLUMN start_label TEXT");
        }
        if (oldVersion < 3) {
            db.execSQL("ALTER TABLE " + TABLE + " ADD COLUMN uploaded INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE " + TABLE + " ADD COLUMN cloud_trip_id TEXT");
            db.execSQL("ALTER TABLE " + TABLE + " ADD COLUMN manual_slot TEXT");
        }
        if (oldVersion < 4) {
            db.execSQL("ALTER TABLE " + TABLE + " ADD COLUMN client_uuid TEXT");
            backfillClientUuids(db);
        }
        if (oldVersion < 5) {
            db.execSQL("ALTER TABLE " + TABLE + " ADD COLUMN km_ev REAL");
            db.execSQL("ALTER TABLE " + TABLE + " ADD COLUMN km_hev REAL");
        }
    }

    // Assegna un UUID ad ogni trip gia' presente sul dispositivo prima di questa versione
    // (SQLite non ha una funzione UUID() integrata, quindi non e' un singolo UPDATE) - senza
    // questo, un trip vecchio caricato prima di questa versione (con la vecchia chiave di
    // idempotenza vehicleId+kind+startedAt) e poi ri-uploadato dopo una ri-associazione
    // continuerebbe comunque a funzionare lato server (fallback sulla vecchia chiave), ma
    // non avrebbe la protezione piu' forte del confronto diretto per UUID - vedi
    // cloud/server/src/routes/device.ts.
    private void backfillClientUuids(SQLiteDatabase db) {
        try (Cursor c = db.query(TABLE, new String[]{"id"}, "client_uuid IS NULL", null, null, null, null)) {
            while (c.moveToNext()) {
                long id = c.getLong(0);
                ContentValues cv = new ContentValues();
                cv.put("client_uuid", UUID.randomUUID().toString());
                db.update(TABLE, cv, "id = ?", new String[]{String.valueOf(id)});
            }
        }
    }

    public long insertTrip(TripRecord r) {
        ContentValues cv = new ContentValues();
        cv.put("type", r.type);
        cv.put("start_time", r.startTime);
        cv.put("end_time", r.endTime);
        cv.put("start_km", r.startKm);
        cv.put("end_km", r.endKm);
        // Colonna dichiarata INTEGER nello schema originale, ma SQLite ha solo "affinita'"
        // di tipo, non un vincolo rigido: un double che non e' un intero esatto (es. 54.3)
        // viene comunque salvato correttamente come REAL. Nessuna migrazione di schema
        // necessaria (vedi ONLY commento in onCreate/onUpgrade).
        cv.put("km_delta", r.kmDelta);
        cv.put("start_fuel_raw", r.startFuelRaw);
        cv.put("end_fuel_raw", r.endFuelRaw);
        if (r.litersDelta != null) cv.put("liters_delta", r.litersDelta); else cv.putNull("liters_delta");
        if (r.avgConsumption != null) cv.put("avg_consumption", r.avgConsumption); else cv.putNull("avg_consumption");
        cv.put("gpx_path", r.gpxPath);
        cv.put("log_path", r.logPath);
        cv.put("label", r.label);
        cv.put("start_label", r.startLabel);
        // Un trip appena inserito non e' mai gia' caricato - uploaded parte sempre da 0,
        // indipendentemente da r.uploaded (che a questo punto e' comunque sempre false:
        // nessun call site lo imposta prima di insertTrip()).
        cv.put("uploaded", 0);
        cv.put("manual_slot", r.manualSlot);
        // Generato qui (non dal chiamante) cosi' ogni trip ne ha sempre uno, a prescindere
        // dal call site - vedi cloud/server/src/routes/device.ts per come viene usato lato
        // server come chiave di idempotenza primaria.
        if (r.clientUuid == null) r.clientUuid = UUID.randomUUID().toString();
        cv.put("client_uuid", r.clientUuid);
        if (r.kmEv != null) cv.put("km_ev", r.kmEv); else cv.putNull("km_ev");
        if (r.kmHev != null) cv.put("km_hev", r.kmHev); else cv.putNull("km_hev");
        return getWritableDatabase().insert(TABLE, null, cv);
    }

    // Trip non ancora caricati sul cloud, indipendentemente dal tipo (AUTO/MANUAL) - usati
    // da SyncWorker per capire cosa c'e' da inviare. Ordine cronologico (piu' vecchi prima)
    // cosi' una serie di upload falliti/in coda non "salta" mai i trip piu' vecchi.
    public List<TripRecord> getUnsyncedTrips() {
        List<TripRecord> list = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query(TABLE, null, "uploaded = 0",
                null, null, null, "start_time ASC")) {
            while (c.moveToNext()) {
                list.add(fromCursor(c));
            }
        }
        return list;
    }

    // Chiamato da SyncWorker dopo un upload riuscito per un singolo trip.
    public void markUploaded(long id, String cloudTripId) {
        ContentValues cv = new ContentValues();
        cv.put("uploaded", 1);
        cv.put("cloud_trip_id", cloudTripId);
        getWritableDatabase().update(TABLE, cv, "id = ?", new String[]{String.valueOf(id)});
    }

    // Cancellazione multipla dallo Storico (vedi MainActivity, selezione righe). Non
    // tocca i file .gpx/log su disco - la responsabilita' di eliminarli (path noti solo
    // al chiamante, che ha gia' in mano i TripRecord completi) resta a MainActivity.
    public void deleteTrips(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return;
        StringBuilder placeholders = new StringBuilder();
        String[] args = new String[ids.size()];
        for (int i = 0; i < ids.size(); i++) {
            if (i > 0) placeholders.append(",");
            placeholders.append("?");
            args[i] = String.valueOf(ids.get(i));
        }
        getWritableDatabase().delete(TABLE, "id IN (" + placeholders + ")", args);
    }

    public List<TripRecord> getTrips(String type) {
        List<TripRecord> list = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query(TABLE, null, "type = ?",
                new String[]{type}, null, null, "start_time DESC")) {
            while (c.moveToNext()) {
                list.add(fromCursor(c));
            }
        }
        return list;
    }

    private TripRecord fromCursor(Cursor c) {
        TripRecord r = new TripRecord();
        r.id = c.getLong(c.getColumnIndexOrThrow("id"));
        r.type = c.getString(c.getColumnIndexOrThrow("type"));
        r.startTime = c.getLong(c.getColumnIndexOrThrow("start_time"));
        r.endTime = c.getLong(c.getColumnIndexOrThrow("end_time"));
        r.startKm = c.getInt(c.getColumnIndexOrThrow("start_km"));
        r.endKm = c.getInt(c.getColumnIndexOrThrow("end_km"));
        // getDouble() legge correttamente sia i vecchi valori interi (trip registrati
        // prima di questo cambio) sia i nuovi valori REAL con decimale.
        r.kmDelta = c.getDouble(c.getColumnIndexOrThrow("km_delta"));
        r.startFuelRaw = c.getInt(c.getColumnIndexOrThrow("start_fuel_raw"));
        r.endFuelRaw = c.getInt(c.getColumnIndexOrThrow("end_fuel_raw"));
        int litersIdx = c.getColumnIndexOrThrow("liters_delta");
        r.litersDelta = c.isNull(litersIdx) ? null : c.getDouble(litersIdx);
        int avgIdx = c.getColumnIndexOrThrow("avg_consumption");
        r.avgConsumption = c.isNull(avgIdx) ? null : c.getDouble(avgIdx);
        r.gpxPath = c.getString(c.getColumnIndexOrThrow("gpx_path"));
        r.logPath = c.getString(c.getColumnIndexOrThrow("log_path"));
        r.label = c.getString(c.getColumnIndexOrThrow("label"));
        r.startLabel = c.getString(c.getColumnIndexOrThrow("start_label"));
        r.uploaded = c.getInt(c.getColumnIndexOrThrow("uploaded")) != 0;
        r.cloudTripId = c.getString(c.getColumnIndexOrThrow("cloud_trip_id"));
        r.manualSlot = c.getString(c.getColumnIndexOrThrow("manual_slot"));
        r.clientUuid = c.getString(c.getColumnIndexOrThrow("client_uuid"));
        int kmEvIdx = c.getColumnIndexOrThrow("km_ev");
        r.kmEv = c.isNull(kmEvIdx) ? null : c.getDouble(kmEvIdx);
        int kmHevIdx = c.getColumnIndexOrThrow("km_hev");
        r.kmHev = c.isNull(kmHevIdx) ? null : c.getDouble(kmHevIdx);
        return r;
    }
}
