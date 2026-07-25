package com.phabryc.jaedrive;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.car.Car;
import android.car.hardware.CarPropertyValue;
import android.car.hardware.property.CarPropertyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.format.DateFormat;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

// Registra un tracciato GPX per ogni percorso guidato, monitorando in continuo
// (anche ad app chiusa) la MARCIA (GEAR_SELECTION): il percorso si apre quando
// si esce da PARK, si chiude quando si rientra in PARK.
//
// NOTA: IGNITION_STATE su questo veicolo si e' rivelato statico/fasullo (resta
// sempre a 4 anche spegnendo e riaccendendo col tasto start/stop). Anche la
// VELOCITA' e' stata scartata come trigger: con un debounce di minuti necessario
// per non tagliare il percorso ai semafori, si rischia che la head unit si spenga
// prima che il timer scatti, perdendo la chiusura del file. GEAR_PARK invece
// viene impostato dal guidatore SUBITO al parcheggio, prima di spegnere/scendere:
// il rischio di race condition con lo spegnimento e' quasi azzerato, e serve solo
// un debounce breve per ignorare un tocco accidentale di P durante la guida.
public class TrackingService extends Service {

    private static final String TAG = "JaeDriveTracking";
    private static final int NOTIF_ID = 42;
    private static final String CHANNEL_ID = "jaedrive_tracking";

    private static final int IGNITION_STATE = 0x11400409;
    private static final int GEAR_SELECTION = 0x11400400;
    private static final int GEAR_PARK = 4; // android.car.VehicleGear.GEAR_PARK (verificato via SDK jar)

    private static final long STOP_DEBOUNCE_MS = 5 * 1000L; // 5s in PARK prima di chiudere il percorso (ridotto da 30s dopo test sul campo)

    // Log persistito su file: il Service gira spesso senza che MainActivity sia aperta,
    // quindi Log.d/Log.e da soli (logcat) non sono raggiungibili dalla tab LOG dell'app.
    private static final String LOG_FILE = "tracking_log.txt";
    private static final long MAX_LOG_SIZE = 200_000;

    private Car mCar;
    private CarPropertyManager mCarPropertyManager;
    private LocationManager mLocationManager;
    private NotificationManager mNotificationManager;
    private VDInfoClient vdInfoClient;

    private boolean tracking = false;
    private final List<double[]> points = new ArrayList<>(); // lat, lon, ele, timeMillis
    private String currentTripFileName;
    private Double tripAverageForGpx; // ultimo calcolato, scritto nel <desc> del GPX

    // Log dedicato al singolo viaggio in corso (sottoinsieme del log generale del service),
    // salvato su file e allegato al record del viaggio in TripDatabase alla chiusura.
    private StringBuilder tripLogBuffer;

    // Ultimi valori noti da VDB (km totali / carburante consumato cumulativo / energy
    // flow), aggiornati in continuo cosi' sono gia' pronti nel momento esatto in cui si
    // apre/chiude un viaggio o si registra un punto GPS.
    private static final int KEY_TOTAL_MILEAGE = VDInfoClient.keyFor(VDInfoClient.MODULE_NEW_ENERGY, VDInfoClient.ID_TOTAL_MILEAGE);
    private static final int KEY_SUM_FUEL = VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_SUM_FUEL);
    private static final int KEY_ENERGY_FLOW = VDInfoClient.keyFor(VDInfoClient.MODULE_NEW_ENERGY, VDInfoClient.ID_ENERGY_FLOW);
    // ID_TRIP (confermato dall'utente sul campo): fonte km per i viaggi, al posto del
    // vecchio ID_TOTAL_MILEAGE. KEY_TOTAL_MILEAGE resta letto solo per popolare i campi
    // legacy start_km/end_km di TripRecord (mai mostrati in UI, tenuti solo per
    // compatibilita' di schema col database gia' presente sul dispositivo).
    private static final int KEY_TRIP_KM = VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_TRIP);
    // % batteria/carburante campionati per punto GPS insieme a energyFlow, scritti come
    // estensioni <jd:batteryPct>/<jd:fuelPct> nel GPX (vedi buildGpx()) - stessa formula di
    // decodifica gia' confermata sul campo e usata da MainActivity per la barra di stato
    // (updateFooterStatus()): combine a 16 bit big-endian, /100 per il SOC, /10 per il
    // carburante. -1 finche' non arriva la prima lettura.
    private static final int KEY_DISPLAY_SOC = VDInfoClient.keyFor(VDInfoClient.MODULE_NEW_ENERGY, VDInfoClient.ID_DISPLAY_SOC);
    private static final int KEY_FUEL_PERCENT = VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_FUEL_PERCENT);
    private float lastKnownSocPct = -1f;
    private float lastKnownFuelPct = -1f;
    private int lastKnownKm = -1;
    // Solo per i campi legacy start_fuel_raw/end_fuel_raw di TripRecord (mai mostrati in
    // UI) - il consumo vero e' un accumulatore, vedi lastFuelLiters/handleFuel().
    private int lastKnownFuelRaw = -1;
    private int lastKnownEnergyFlow = -1;
    // Ultima lettura nota di ID_TRIP in km (con decimale) - null finche' non arriva la
    // prima lettura, cosi' la primissima non genera un delta fasullo rispetto a 0.
    private Float lastTripKm = null;
    // Come lastTripKm, ma per SUM_FUEL (litri, gia' scalato): SUM_FUEL puo' essere
    // azzerato dall'utente in qualsiasi momento tramite il computer di bordo NATIVO
    // dell'auto (indipendentemente da JaeDrive), non solo ad ogni accensione come
    // ID_TRIP - stessa logica di gestione del reset (vedi handleFuel()).
    private Float lastFuelLiters = null;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable stopTripRunnable = this::stopTrip;

    private final LocationListener locationListener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            // Il 5o elemento e' il valore ENERGY_FLOW campionato nello stesso istante del
            // punto GPS (-1 se non ancora disponibile), usato per colorare la traccia per
            // segmento e calcolare le percentuali EV/serie/parallelo del viaggio. 6o e 7o:
            // % batteria e % carburante nello stesso istante (-1 se non ancora disponibili).
            points.add(new double[]{
                location.getLatitude(), location.getLongitude(),
                location.hasAltitude() ? location.getAltitude() : 0.0,
                (double) location.getTime(),
                (double) lastKnownEnergyFlow,
                (double) lastKnownSocPct,
                (double) lastKnownFuelPct
            });
            updateNotification("Registrazione percorso: " + points.size() + " punti");
            if (points.size() % 5 == 0) {
                persistGpx();
            }
        }

        @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
        @Override public void onProviderEnabled(String provider) {}
        @Override public void onProviderDisabled(String provider) {}
    };

    // Solo diagnostica/log: non guida piu' l'avvio/stop del percorso (vedi nota in cima al file).
    private final CarPropertyManager.CarPropertyEventCallback ignitionCallback =
        new CarPropertyManager.CarPropertyEventCallback() {
            @Override
            public void onChangeEvent(CarPropertyValue value) {
                appendServiceLog("IGNITION_STATE (solo diagnostica) = " + value.getValue());
            }

            @Override
            public void onErrorEvent(int propId, int zone) {
                appendServiceLog("onErrorEvent ignition: zone=" + zone);
            }
        };

    // Trigger reale per apertura/chiusura percorso: marcia (esce/rientra da PARK).
    private final CarPropertyManager.CarPropertyEventCallback gearCallback =
        new CarPropertyManager.CarPropertyEventCallback() {
            @Override
            public void onChangeEvent(CarPropertyValue value) {
                handleGearValue(value.getValue());
            }

            @Override
            public void onErrorEvent(int propId, int zone) {
                appendServiceLog("onErrorEvent gear: zone=" + zone);
            }
        };

    // Con la modalita' debug disattivata dalle Impostazioni, evitiamo qualunque I/O su file
    // (log generale + log per-viaggio): Log.d resta comunque gratuito (solo logcat, nessuno
    // storage dell'app) e utile per un ADB collegato al volo senza dover riattivare nulla.
    private void appendServiceLog(String msg) {
        Log.d(TAG, msg);
        if (!Prefs.isDebugModeEnabled(this)) return;
        String line = DateFormat.format("HH:mm:ss", System.currentTimeMillis()) + "  " + msg + "\n";
        if (tripLogBuffer != null) {
            tripLogBuffer.append(line);
        }
        try {
            File f = new File(getFilesDir(), LOG_FILE);
            if (f.exists() && f.length() > MAX_LOG_SIZE) {
                f.delete();
            }
            try (FileOutputStream fos = new FileOutputStream(f, true)) {
                fos.write(line.getBytes());
            }
        } catch (Exception e) {
            Log.e(TAG, "Errore scrittura log service: " + e);
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        // Il servizio puo' partire indipendentemente da MainActivity (boot/accessibility
        // service) - la migrazione deve girare qui comunque, e' idempotente quindi non
        // fa nulla se MainActivity l'ha gia' eseguita prima.
        TripConsumption.migrateLegacyKeys(this);
        mNotificationManager = getSystemService(NotificationManager.class);
        mLocationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        createNotificationChannel();
        startForeground(NOTIF_ID, buildNotification("In attesa di accensione..."));
        appendServiceLog("TrackingService avviato (onCreate)");
        // Difensivo: normalmente il backfill dei trip storici parte gia' subito dopo un
        // pairing riuscito (vedi MainActivity.finishPairingSuccess()), ma questo copre
        // anche il caso limite di un trip rimasto non sincronizzato per qualche motivo
        // (es. un crash nello stesso istante del pairing) - ad ogni avvio del servizio in
        // background, se l'auto e' associata, si ricontrolla. SyncScheduler.enqueueSync()
        // e' economico quando non c'e' nulla da fare (WorkManager APPEND_OR_REPLACE).
        SyncScheduler.enqueueSync(this);
        connectCar();
        connectVdbInfo();
    }

    // Client VDB dedicato (indipendente da quello di MainActivity) per conoscere in ogni
    // momento km totali e carburante consumato cumulativo, necessari per calcolare il
    // consumo medio del viaggio esattamente agli stessi istanti di apertura/chiusura traccia.
    private void connectVdbInfo() {
        vdInfoClient = new VDInfoClient(this, new VDInfoClient.Listener() {
            @Override
            public void onLog(String msg) {
                appendServiceLog("[VDB] " + msg);
            }

            @Override
            public void onValue(int key, int[] value) {
                if (key == KEY_TOTAL_MILEAGE) {
                    // Solo per i campi legacy start_km/end_km di TripRecord (vedi commento
                    // sopra) - non piu' usato per calcolare la distanza del viaggio.
                    lastKnownKm = VDInfoClient.decodeLastTwoAsInt(value);
                } else if (key == KEY_SUM_FUEL) {
                    handleFuel(value);
                } else if (key == KEY_ENERGY_FLOW && value.length > 0) {
                    // ENERGY_FLOW e' un valore diretto (enum di stato), non un combine a 16 bit.
                    lastKnownEnergyFlow = value[0];
                } else if (key == KEY_TRIP_KM) {
                    handleTripKm(value);
                } else if (key == KEY_DISPLAY_SOC && value.length >= 2) {
                    lastKnownSocPct = (value[0] * 256 + value[1]) / 100.0f;
                } else if (key == KEY_FUEL_PERCENT && value.length >= 2) {
                    lastKnownFuelPct = (value[0] * 256 + value[1]) / 10.0f;
                }
                tryMigrateManualLegacy();
            }

            @Override
            public void onBindStateChanged(boolean bound) {
                appendServiceLog("VDB CAR_INFO (TrackingService) bound=" + bound);
            }
        });
        vdInfoClient.connect();
    }

    // ID_TRIP si azzera da solo ad ogni accensione del motore, quindi non e' leggibile
    // come baseline-snapshot (a differenza del vecchio ID_TOTAL_MILEAGE): ad ogni lettura
    // sommiamo il delta rispetto alla lettura precedente. Se il nuovo valore e' PIU'
    // BASSO del precedente, il contatore e' appena stato resettato (nuova accensione) -
    // in quel caso il delta e' semplicemente il nuovo valore stesso (che rappresenta gia'
    // "km dall'accensione"), non va sottratto nulla. Il delta va sommato sia al viaggio
    // automatico corrente (se aperto) sia SEMPRE ai due trip computer manuali (accumulano
    // in continuo, indipendentemente dal viaggio a marcia).
    //
    // Confermato sul campo: alla chiusura di un viaggio ID_TRIP puo' restituire una
    // lettura fuori scala (letta oltre 40.000.000, con la scala x0.1 sarebbero milioni di
    // km) - un valore chiaramente spurio del bus, non un vero dato. Campionando ogni ~2s
    // un'auto reale non puo' percorrere piu' di qualche km tra due letture consecutive:
    // scartiamo (senza aggiornare lastTripKm, cosi' la prossima lettura buona si confronta
    // ancora con l'ultimo valore valido invece che con quello corrotto) qualunque delta
    // sopra MAX_PLAUSIBLE_KM_DELTA.
    private static final float MAX_PLAUSIBLE_KM_DELTA = 10f;

    private void handleTripKm(int[] value) {
        float tripKmNow = VDInfoClient.decodeFullBigEndianInt(value) * 0.1f;
        if (lastTripKm != null) {
            float delta = tripKmNow >= lastTripKm ? (tripKmNow - lastTripKm) : tripKmNow;
            if (delta > MAX_PLAUSIBLE_KM_DELTA) {
                appendServiceLog(String.format(Locale.US,
                    "ID_TRIP valore spurio scartato: letto %.1f km (delta %.1f km, oltre la soglia di %.0f km)",
                    tripKmNow, delta, MAX_PLAUSIBLE_KM_DELTA));
                return;
            }
            if (delta > 0) {
                if (tracking) TripConsumption.addKm(this, delta);
                ManualTripComputer.addKm(this, delta);
            }
        }
        lastTripKm = tripKmNow;
    }

    // SUM_FUEL puo' essere azzerato dall'utente in qualsiasi momento tramite il computer
    // di bordo NATIVO dell'auto, non solo ad ogni accensione come ID_TRIP - un reset a
    // meta' sessione farebbe apparire un delta negativo con un semplice calcolo "attuale -
    // baseline alla partenza" (il bug che si voleva evitare). Stessa gestione di
    // handleTripKm(): un valore piu' basso del precedente e' trattato come "appena
    // resettato", il delta e' il nuovo valore stesso invece di una sottrazione negativa.
    private void handleFuel(int[] value) {
        lastKnownFuelRaw = VDInfoClient.decodeLastTwoAsInt(value);
        float fuelLitersNow = lastKnownFuelRaw * 0.1f;
        if (lastFuelLiters != null) {
            float delta = fuelLitersNow >= lastFuelLiters ? (fuelLitersNow - lastFuelLiters) : fuelLitersNow;
            if (delta > 0) {
                if (tracking) TripConsumption.addLiters(this, delta);
                ManualTripComputer.addLiters(this, delta);
            }
        }
        lastFuelLiters = fuelLitersNow;
    }

    // Progresso gia' accumulato dagli slot manuali PRIMA del passaggio al modello ad
    // accumulatore (vedi ManualTripComputer): il vecchio codice teneva una baseline
    // "km/carburante al reset" e calcolava il delta per sottrazione contro l'odometro
    // (ID_TOTAL_MILEAGE)/SUM_FUEL correnti. Il refactor ha smesso di leggere quelle
    // chiavi ma non le ha rimosse - appena abbiamo una lettura corrente valida di
    // entrambe le fonti, ricostruiamo il delta con la stessa formula di prima e lo
    // versiamo nel nuovo accumulatore, una tantum (vedi ManualTripComputer.migrateLegacyIfNeeded()).
    private boolean manualLegacyMigrationDone = false;

    private void tryMigrateManualLegacy() {
        if (manualLegacyMigrationDone) return;
        if (lastKnownKm < 0 || lastKnownFuelRaw < 0) return;
        ManualTripComputer.migrateLegacyIfNeeded(this, lastKnownKm, lastKnownFuelRaw);
        manualLegacyMigrationDone = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        mainHandler.removeCallbacks(stopTripRunnable);
        if (tracking) {
            mLocationManager.removeUpdates(locationListener);
        }
        if (mCar != null && mCar.isConnected()) {
            mCar.disconnect();
        }
        if (vdInfoClient != null) {
            vdInfoClient.disconnect();
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "JaeDrive tracciamento", NotificationManager.IMPORTANCE_LOW);
            mNotificationManager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("JaeDrive")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build();
    }

    private void updateNotification(String text) {
        mNotificationManager.notify(NOTIF_ID, buildNotification(text));
    }

    private void connectCar() {
        mCar = Car.createCar(this, new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder service) {
                appendServiceLog("Car service connesso");
                mCarPropertyManager = (CarPropertyManager) mCar.getCarManager(Car.PROPERTY_SERVICE);
                if (mCarPropertyManager == null) {
                    appendServiceLog("CarPropertyManager NULL");
                    return;
                }
                try {
                    mCarPropertyManager.registerCallback(ignitionCallback, IGNITION_STATE,
                        CarPropertyManager.SENSOR_RATE_NORMAL);
                    appendServiceLog("Subscribed IGNITION_STATE (solo diagnostica)");
                } catch (Exception e) {
                    appendServiceLog("Errore subscribe ignition: " + e);
                }

                try {
                    mCarPropertyManager.registerCallback(gearCallback, GEAR_SELECTION,
                        CarPropertyManager.SENSOR_RATE_NORMAL);
                    appendServiceLog("Subscribed GEAR_SELECTION (trigger percorso)");
                    CarPropertyValue<?> val = mCarPropertyManager.getProperty(GEAR_SELECTION, 0);
                    if (val != null) {
                        appendServiceLog("GEAR_SELECTION iniziale = " + val.getValue());
                        handleGearValue(val.getValue());
                    }
                } catch (Exception e) {
                    appendServiceLog("Errore subscribe gear: " + e);
                }
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                appendServiceLog("Car service disconnesso");
            }
        });
        mCar.connect();
    }

    private void handleGearValue(Object val) {
        if (!(val instanceof Integer)) return;
        int gear = (Integer) val;
        appendServiceLog("GEAR_SELECTION cambiato: " + gear + (gear == GEAR_PARK ? " (PARK)" : ""));

        if (gear == GEAR_PARK) {
            if (tracking) {
                // non chiudere subito: un tocco accidentale di P durante la guida non deve
                // tagliare il percorso. 30s bastano a coprire il caso reale (si e' fermati
                // per parcheggiare) restando comunque ben prima di un eventuale spegnimento.
                mainHandler.removeCallbacks(stopTripRunnable);
                mainHandler.postDelayed(stopTripRunnable, STOP_DEBOUNCE_MS);
            }
        } else {
            mainHandler.removeCallbacks(stopTripRunnable); // uscito da P: annulla un eventuale stop programmato
            if (!tracking) {
                if (TripConsumption.isActive(this)) {
                    // Il servizio e' stato riavviato (es. ucciso dal sistema) mentre un
                    // viaggio era gia' in corso: la baseline del consumo e' gia' persistita,
                    // riprendiamo senza resettarla. La traccia GPX invece riparte da capo
                    // (i punti gia' registrati prima del riavvio non sono recuperabili).
                    tracking = true;
                    appendServiceLog("Ripresa viaggio gia' in corso (baseline consumo persistita)");
                    resumeGpxRecording();
                } else {
                    appendServiceLog("Uscita da PARK: apro percorso");
                    startTrip();
                }
            }
        }
    }

    private void resumeGpxRecording() {
        points.clear();
        tripLogBuffer = Prefs.isDebugModeEnabled(this) ? new StringBuilder() : null;
        currentTripFileName = "Percorso_" + DateFormat.format("yyyyMMdd_HHmmss", System.currentTimeMillis()) + ".gpx";
        updateNotification("Registrazione percorso ripresa");
        startGpsIfEnabled();
    }

    // Il toggle "Salva traccia GPS" in Impostazioni disattiva solo la registrazione della
    // posizione: il viaggio resta comunque aperto/chiuso a marcia per il calcolo dei
    // consumi (km/litri via VDB), che non dipende dal permesso di localizzazione.
    @SuppressWarnings("MissingPermission")
    private void startGpsIfEnabled() {
        if (!Prefs.isGpsTrackEnabled(this)) {
            appendServiceLog("Traccia GPS disattivata dalle Impostazioni: registro solo i dati di consumo");
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            appendServiceLog("ACCESS_FINE_LOCATION NON concesso: impossibile tracciare il percorso GPS");
            updateNotification("Permesso posizione mancante — apri l'app");
            return;
        }
        try {
            mLocationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 5, locationListener);
            appendServiceLog("GPS_PROVIDER: richiesti aggiornamenti posizione");
        } catch (Exception e) {
            appendServiceLog("Errore avvio GPS: " + e);
        }
    }

    // Km dell'odometro e litri "raw" alla partenza (solo per i campi legacy start_km/
    // start_fuel_raw di TripRecord, mai mostrati in UI) - i valori veri del viaggio sono
    // gli accumulatori di TripConsumption (km/litri, entrambi ormai fonti resettabili
    // in autonomia dal veicolo - vedi commenti su handleTripKm()/handleFuel()).
    private int tripStartKmLegacy = -1;
    private int tripStartFuelRawLegacy = -1;

    private void startTrip() {
        tracking = true;
        points.clear();
        tripLogBuffer = Prefs.isDebugModeEnabled(this) ? new StringBuilder() : null;
        currentTripFileName = "Percorso_" + DateFormat.format("yyyyMMdd_HHmmss", System.currentTimeMillis()) + ".gpx";
        tripStartKmLegacy = lastKnownKm;
        tripStartFuelRawLegacy = lastKnownFuelRaw;

        TripConsumption.startTrip(this);
        appendServiceLog("Trip avviato: " + currentTripFileName + " (km/litri da accumulatore, azzerati alla partenza)");
        updateNotification("Registrazione percorso avviata");
        startGpsIfEnabled();
    }

    // Sotto questa soglia il viaggio automatico non viene salvato nello Storico: troppo
    // corto per essere un vero spostamento (es. una manovra di parcheggio che tocca
    // brevemente P, o un rimbalzo del debounce marcia) - non richiesto singolarmente
    // per i trip manuali, quelli restano sempre salvati qualunque sia la distanza.
    private static final double MIN_AUTO_TRIP_KM = 0.5;

    private void stopTrip() {
        tracking = false;
        mLocationManager.removeUpdates(locationListener);
        tripAverageForGpx = TripConsumption.computeAverage(this);
        double litersDelta = TripConsumption.getLitersDelta(this);
        long startTime = TripConsumption.getStartTime(this);
        double kmDelta = TripConsumption.getKmDelta(this);
        int startFuelRaw = tripStartFuelRawLegacy;
        TripConsumption.endTrip(this);
        appendServiceLog("Consumo medio viaggio: " + (tripAverageForGpx != null
            ? String.format(Locale.US, "%.2f km/l", tripAverageForGpx) : "non calcolabile")
            + String.format(Locale.US, " (km=%.1f, litri=%.2f)", kmDelta, litersDelta));

        if (kmDelta < MIN_AUTO_TRIP_KM) {
            appendServiceLog(String.format(Locale.US,
                "Trip scartato: %.2f km, sotto la soglia minima di %.1f km", kmDelta, MIN_AUTO_TRIP_KM));
            discardTripFiles();
        } else {
            persistGpx();
            String logPath = persistTripLog();
            double[] firstPoint = points.isEmpty() ? null : points.get(0);
            double[] lastPoint = points.isEmpty() ? null : points.get(points.size() - 1);
            saveTripRecordAsync(startTime, kmDelta, startFuelRaw, litersDelta, logPath, firstPoint, lastPoint);
        }
        appendServiceLog("Trip terminato: " + currentTripFileName + " (" + points.size() + " punti)");
        updateNotification("In attesa di accensione...");
        tripLogBuffer = null;
    }

    // Rimuove l'eventuale .gpx gia' scritto su disco dai salvataggi periodici durante il
    // tracciamento (ogni 5 punti, vedi locationListener) - un trip scartato non deve
    // lasciare in giro file orfani mai referenziati da nessun TripRecord.
    private void discardTripFiles() {
        if (currentTripFileName == null) return;
        File gpxFile = new File(getFilesDir(), currentTripFileName);
        if (gpxFile.exists() && !gpxFile.delete()) {
            appendServiceLog("Impossibile eliminare il gpx del trip scartato: " + gpxFile);
        }
    }

    // Salva il log raccolto durante il viaggio in un file dedicato (stesso nome base del GPX),
    // cosi' l'export dalla tab PERCORSI puo' allegarlo insieme alla traccia.
    private String persistTripLog() {
        if (tripLogBuffer == null || currentTripFileName == null) return null;
        String logFileName = currentTripFileName.replace(".gpx", "_log.txt");
        File f = new File(getFilesDir(), logFileName);
        try (FileOutputStream fos = new FileOutputStream(f)) {
            fos.write(tripLogBuffer.toString().getBytes());
            return f.getAbsolutePath();
        } catch (Exception e) {
            appendServiceLog("Errore salvataggio log viaggio: " + e);
            return null;
        }
    }

    // Il reverse geocoding (rete) non deve bloccare il thread principale del service:
    // tutto il salvataggio finale del record (indirizzi + insert nel DB) gira su un
    // thread dedicato, cosi' un eventuale ritardo/timeout di rete non rallenta nient'altro.
    // Geocodifica sia il PRIMO punto (indirizzo di partenza, TripRecord.startLabel) sia
    // l'ULTIMO (destinazione, TripRecord.label, gia' esistente) - due chiamate Nominatim
    // separate, accettabile dato che avviene una sola volta a fine viaggio, non in un ciclo.
    private void saveTripRecordAsync(long startTime, double kmDelta, int startFuelRaw, Double litersDelta,
                                      String logPath, double[] firstPoint, double[] lastPoint) {
        int endKm = lastKnownKm;
        int startKm = tripStartKmLegacy;
        int endFuelRaw = lastKnownFuelRaw;
        // Se la baseline VDB non era ancora disponibile all'apertura del viaggio (es. avvio
        // a freddo), evitiamo un delta insensato sul carburante: i litri restano a 0, ma la
        // traccia GPX e il log vengono comunque salvati e resi visibili in PERCORSI.
        if (startKm < 0) startKm = endKm;
        if (startFuelRaw < 0) startFuelRaw = endFuelRaw;
        long start = startTime > 0 ? startTime : System.currentTimeMillis();
        // Se il tracciamento GPS era disattivato (Impostazioni) o non ci sono stati punti,
        // il file .gpx non esiste: non salviamo un path che punterebbe al nulla.
        File gpxFile = new File(getFilesDir(), currentTripFileName);
        String gpxPath = gpxFile.exists() ? gpxFile.getAbsolutePath() : null;

        int fStartKm = startKm, fEndKm = endKm, fStartFuel = startFuelRaw, fEndFuel = endFuelRaw;
        double fKmDelta = kmDelta;
        long fStart = start;
        long fEnd = System.currentTimeMillis();
        Double fAvg = tripAverageForGpx;

        new Thread(() -> {
            String label = null;
            String startLabel = null;
            if (NetUtils.hasInternet(this)) {
                if (lastPoint != null) label = reverseGeocode(lastPoint[0], lastPoint[1]);
                if (firstPoint != null) startLabel = reverseGeocode(firstPoint[0], firstPoint[1]);
            }
            TripRecord record = new TripRecord(TripRecord.TYPE_AUTO, fStart, fEnd,
                fStartKm, fEndKm, fKmDelta, fStartFuel, fEndFuel, litersDelta, fAvg, gpxPath, logPath, label);
            record.startLabel = startLabel;
            try {
                TripDatabase.getInstance(this).insertTrip(record);
                appendServiceLog("Trip salvato in TripDatabase" + (label != null ? " (destinazione: " + label + ")" : "")
                    + (startLabel != null ? " (partenza: " + startLabel + ")" : ""));
                SyncScheduler.enqueueSync(this);
            } catch (Exception e) {
                appendServiceLog("Errore salvataggio trip nel database: " + e);
            }
        }, "JaeDrive-TripSave").start();
    }

    // Reverse geocoding via Nominatim (OpenStreetMap) invece del Geocoder di sistema:
    // questo ROM installa app tramite Aurora Store (assenza di Google Play Services),
    // quindi il Geocoder Android integrato (che su molti dispositivi si appoggia al
    // backend Google) non e' un'opzione affidabile. Nominatim e' una semplice HTTPS GET,
    // nessuna dipendenza extra, coerente con l'uso di OSM gia' fatto per la mappa.
    private String reverseGeocode(double lat, double lon) {
        try {
            java.net.URL url = new java.net.URL(String.format(Locale.US,
                "https://nominatim.openstreetmap.org/reverse?format=json&lat=%.6f&lon=%.6f&zoom=17&addressdetails=1",
                lat, lon));
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
            conn.setRequestProperty("User-Agent", "JaeDrive-Android/1.0");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            if (conn.getResponseCode() != 200) return null;
            StringBuilder sb = new StringBuilder();
            try (java.io.BufferedReader r = new java.io.BufferedReader(
                    new java.io.InputStreamReader(conn.getInputStream()))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
            org.json.JSONObject json = new org.json.JSONObject(sb.toString());
            org.json.JSONObject addr = json.optJSONObject("address");
            if (addr == null) return json.optString("display_name", null);
            String road = firstNonEmpty(addr, "road", "pedestrian", "footway", "residential");
            String place = firstNonEmpty(addr, "city", "town", "village", "suburb", "county");
            if (road != null && place != null) return road + ", " + place;
            if (place != null) return place;
            if (road != null) return road;
            return json.optString("display_name", null);
        } catch (Exception e) {
            appendServiceLog("Errore reverse geocoding: " + e);
            return null;
        }
    }

    private String firstNonEmpty(org.json.JSONObject obj, String... keys) {
        for (String k : keys) {
            String v = obj.optString(k, null);
            if (v != null && !v.isEmpty()) return v;
        }
        return null;
    }

    // Sempre in storage interno: l'export su USB (on demand) e' gestito dalla tab
    // "PERCORSI" in MainActivity, non dal service durante la registrazione.
    private void persistGpx() {
        if (points.isEmpty() || currentTripFileName == null) return;
        try (OutputStream os = openFileOutput(currentTripFileName, MODE_PRIVATE);
             OutputStreamWriter w = new OutputStreamWriter(os)) {
            w.write(buildGpx());
        } catch (Exception e) {
            appendServiceLog("Errore salvataggio GPX: " + e);
        }
    }

    // Namespace custom per l'estensione ENERGY_FLOW nel GPX: il file resta uno standard
    // GPX 1.1 valido e importabile ovunque (es. Google Maps, che ignora semplicemente
    // l'estensione che non conosce), ma porta con se' il dato per colorare la traccia
    // per segmento quando viene riletto da JaeDrive stesso (vedi GpxReader).
    private static final String GPX_EXT_NAMESPACE = "https://jaedrive.app/gpx-ext";

    private String buildGpx() {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<gpx version=\"1.1\" creator=\"JaeDrive\" xmlns=\"http://www.topografix.com/GPX/1/1\" xmlns:jd=\"")
            .append(GPX_EXT_NAMESPACE).append("\">\n");
        sb.append("  <trk><name>").append(currentTripFileName).append("</name>");
        if (tripAverageForGpx != null) {
            sb.append("<desc>Consumo medio: ").append(String.format(Locale.US, "%.2f", tripAverageForGpx))
                .append(" km/l</desc>");
        }
        sb.append("<trkseg>\n");
        for (double[] p : points) {
            String iso = Instant.ofEpochMilli((long) p[3]).toString();
            int energyFlow = p.length > 4 ? (int) p[4] : -1;
            double socPct = p.length > 5 ? p[5] : -1;
            double fuelPct = p.length > 6 ? p[6] : -1;
            sb.append(String.format(Locale.US,
                "    <trkpt lat=\"%.6f\" lon=\"%.6f\"><ele>%.1f</ele><time>%s</time>",
                p[0], p[1], p[2], iso));
            StringBuilder ext = new StringBuilder();
            if (energyFlow >= 0) ext.append("<jd:energyFlow>").append(energyFlow).append("</jd:energyFlow>");
            if (socPct >= 0) ext.append(String.format(Locale.US, "<jd:batteryPct>%.1f</jd:batteryPct>", socPct));
            if (fuelPct >= 0) ext.append(String.format(Locale.US, "<jd:fuelPct>%.1f</jd:fuelPct>", fuelPct));
            if (ext.length() > 0) sb.append("<extensions>").append(ext).append("</extensions>");
            sb.append("</trkpt>\n");
        }
        sb.append("  </trkseg></trk>\n</gpx>\n");
        return sb.toString();
    }
}
