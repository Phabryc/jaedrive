package com.phabryc.jaedrive;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import com.desaysv.ivi.vdb.IVDBus;
import com.desaysv.ivi.vdb.event.VDEvent;

import java.util.HashMap;
import java.util.Map;

// Client per il bus VDB Desay, servizio CAR_INFO (com.desaysv.ivi.vds.carinfo).
// Protocollo ricostruito via reverse engineering di SVSetting.apk/SVVDSCarInfo.apk:
// il servizio e' exported=true senza alcun permesso dichiarato nel manifest.
// bind -> IVDBus.Stub.asInterface(binder) -> get(VDEvent(id=modulo, payload={"CMD_ID": segnale}))
// -> risposta: stesso VDEvent con payload sostituito da {"CMD_ID", "VALUE": int[], "IS_NULL": bool}.
public class VDInfoClient {

    private static final String CARINFO_PKG = "com.desaysv.ivi.vds.carinfo";
    private static final String CARINFO_ACTION = "action.desaysv.ivi.vds.carinfo.SERVICE";
    private static final long POLL_INTERVAL_MS = 2000;

    // Moduli (com.desaysv.ivi.vdb.event.id.carinfo.VDEventCarInfo)
    public static final int MODULE_NEW_ENERGY   = 0x50002;
    public static final int MODULE_READONLY_INFO = 0x50004;
    // MODULE_DOANOSE ("diagnose", refuso nel nome originale Desay) - usato solo per
    // ID_MODEL_CODE/ID_BRAND qui sotto (rilevazione modello/marca, tentativo chiuso, vedi
    // quei due campi). Il vecchio tentativo VIN su questo modulo (ID_VIN_ALT=0x10) e' stato
    // rimosso il 2026-08-02: il VIN vero esiste sul sistema ma e' leggibile solo da app con
    // uid=system (vedi ENG MODE, confermato via decompile - sharedUserId="android.uid.system"),
    // architettonicamente irraggiungibile da JaeDrive; l'app usa direttamente "ivi.sn" (S/N
    // del DMC) come identificativo, senza piu' tentare nessuna lettura elettronica del VIN.
    public static final int MODULE_DOANOSE = 0x50007;

    // com.desaysv.ivi.extra.project.carinfo.NewEnergyID
    public static final int ID_DRIVE_MODE      = 0x4;
    public static final int ID_ENERGY_FLOW     = 0x8;
    public static final int ID_TOTAL_MILEAGE   = 0x2e;
    // ID_EV_MILEAGE (0x36)/ID_HEV_MILEAGE (0x32) RIMOSSI dal poll (2026-08-01): confermato
    // sul campo che ID_HEV_MILEAGE restituisce sempre lo stesso valore dell'odometro totale,
    // non una distanza specifica per la modalita' ibrida - non un segnale utilizzabile per
    // calcolare i km EV/HEV di un viaggio (vedi EnergyFlowUtil.computeKmByBucket() per il
    // sostituto, basato sulla traccia GPS/ENERGY_FLOW invece che su questi due ID VDB).
    public static final int ID_DISPLAY_SOC     = 0x2c;
    // CONFERMATO REALE: stesso dispatcher di ID_ENERGY_RECYCLE_LEVEL (SVSetting.apk,
    // updateUIStatus), ramo cmdId=0x2a - combina i PRIMI due elementi dell'array come intero
    // a 16 bit big-endian ((arr[0]&0xff)<<8 | (arr[1]&0xff)), nessuna scala applicata
    // (cast diretto a float), poi passato a un metodo che aggiorna il testo "autonomia" in
    // UI - "Display Mileage" segue la stessa convenzione di nome di "Display SOC" (il
    // numero mostrato sul cruscotto, non un totalizzatore).
    // BUG TROVATO SUL CAMPO (2026-07-26): l'autonomia mostrata in app restava sempre a 0
    // nonostante fosse visibile e diversa da zero nel pannello "Nuova energia" della vettura -
    // il primo tentativo usava decodeLastTwoAsInt() per coerenza con ID_TOTAL_MILEAGE/
    // ID_EV_MILEAGE/ID_HEV_MILEAGE, ma il dispatcher confermato per QUESTO id legge invece i
    // PRIMI due elementi: se l'array ha piu' di 2 elementi (ipotesi gia' segnalata come non
    // confermata quando questo campo fu aggiunto), leggere gli ultimi due prende byte di
    // padding a zero invece del valore vero. Fix: usare decodeFirstTwoAsInt() per questo id
    // specifico (vedi MainActivity.updateFooterStatus()), che e' anche coerente con come SOC/
    // fuel% vengono gia' decodificati inline nello stesso metodo (primi due elementi).
    // CONFERMATO SUL CAMPO (2026-08-02): raw=[0,0] stabile per un'intera giornata di guida
    // (mattina/sera/notte, dozzine di trip reali da 0.6 a 20+ km) - MAI cambiato, e sempre
    // un valore VALIDO (non IS_NULL). Non e' un problema di decodifica (0 combinato da [0,0]
    // e' aritmeticamente corretto): il segnale stesso e' fermo/stub su questa vettura, stessa
    // categoria di FUEL_LEVEL/INFO_MAKE (dati placeholder gia' documentati altrove nel
    // progetto). L'"Autonomia" mostrata in DATI e' quindi affidabile solo come conferma che
    // il segnale non funziona, non come dato reale - da valutare se nascondere la riga.
    public static final int ID_DISPLAY_MILEAGE = 0x2a;
    public static final int ID_VEHICLE_MODE_ID = 0x78;
    // Confermato REALE (non solo "registrato ma senza caller"): il dispatcher UI di
    // SVSetting.apk (smali_classes2/com/desaysv/present/a/a/f$1.smali, metodo
    // updateUIStatus) ha un ramo esplicito per modulo=MODULE_NEW_ENERGY/cmdId=0x25 che
    // chiama onEnergyRecycleLevelChanged(int) con un valore letto da getItemValue()
    // (percorso "valore singolo", non un combine a 16 bit come i campi carburante) -
    // livello di rigenerazione in frenata. Scala CONFERMATA SUL CAMPO 2026-08-02 (test
    // reale in auto, cambiando il livello e leggendo il valore): 0=ALTO, 1=MEDIO, 2=BASSO -
    // scala invertita rispetto all'intuizione "numero piu' alto = livello piu' alto", vedi
    // regenLevelLabel().
    public static final int ID_ENERGY_RECYCLE_LEVEL = 0x25;

    // com.desaysv.ivi.extra.project.carinfo.ReadOnlyID (carburante/consumi)
    public static final int ID_LOW_FUEL_WARNING    = 0x2;
    public static final int ID_SUM_FUEL            = 0x18;
    public static final int ID_AVG_FUEL_CONS       = 0x1e;
    public static final int ID_AVERAGE_OIL_CONSUMPTION_AFTER_CLEAR = 0x25;
    public static final int ID_AVERAGE_OIL_CONSUMPTION_RECENTLY_50KM = 0x24;
    public static final int ID_FUEL_PERCENT        = 0x44;
    public static final int ID_INSTANTANEOUS_CONSUMPTION = 0x46;
    // CONFERMATO CON CHIAMANTE REALE (2026-08-02): com/desaysv/present/a/a/f$1.smali, blocco
    // modulo=0x50004 (MODULE_READONLY_INFO, non MODULE_NEW_ENERGY!), tratta 0x48 e 0x78 come
    // INTERCAMBIABILI per lo stesso valore (stesso ramo if per entrambi) - decodifica primi
    // due elementi big-endian, nessuna scala, esattamente come decodeFirstTwoAsInt(). Questa
    // e' la vera fonte dell'autonomia mostrata nel pannello "Nuova energia": ID_DISPLAY_MILEAGE
    // (NewEnergyID, 0x2a) confermato sul campo essere tutt'altro/inattivo su questa vettura
    // (raw=[0,0] stabile per un'intera giornata di guida) - segnale sbagliato fin dall'inizio,
    // non un problema di formula.
    public static final int ID_ENDURANCE_KM        = 0x48;
    public static final int ID_TOTAL_RANGE         = 0x78;
    // CONFERMATO con un vero chiamante: com.desay.launcher.common.b.b (helper condiviso in
    // SVSetting.apk) chiama getItemValue(0x50004, 0x5f), scompone il risultato bit a bit in
    // un array di 4 booleani (uno per ruota) e lo passa a onTirePressureWarning(ZZZZ) per
    // accendere le icone di allarme gomme nell'app Settings - stesso livello di evidenza di
    // ID_ENERGY_RECYCLE_LEVEL. Formato esatto dell'array VALUE restituito da IVDBus.get()
    // (quanti elementi, quale contiene il bitfield) non confermato per la nostra chiamata
    // "get" grezza - loggato raw per ora, vedi MainActivity.renderTirePressureWarning().
    public static final int ID_TIRE_PRESSURE_WARNING = 0x5f;
    // Stessa classe/modulo, subito dopo il warning nell'enum - presumibilmente il valore
    // numerico vero (PSI/kPa) per ruota, ma NESSUN caller trovato in nessuno dei 6 APK
    // decompilati - stessa situazione in cui erano VIN_ALT/MODEL_CODE/BRAND prima di
    // provarli. Potrebbe restituire IS_NULL o un valore reale, non lo sappiamo senza test.
    public static final int ID_TIRE_PRESSURE = 0x8c;
    // Stessa classe DiagnosisID/stesso modulo MODULE_DOANOSE - candidati per modello/marca
    // reali (vedi TODO "rilevazione automatica modello/motorizzazione"). Nessun caller di
    // riferimento trovato (come ID_VIN_ALT), ma il dispatcher di CarInfoService
    // (smali com/desaysv/ivi/vds/carinfo/a/a.smali) registra MODULE_DOANOSE=0x50007 con un
    // range di comandi fino a 0xf8, che copre comodamente sia 0x16 che 0x87 - stessa
    // evidenza indiretta che ha giustificato di provare ID_VIN_ALT. Formato di decodifica
    // sconosciuto, primo tentativo come stringa ASCII (vedi decodeAsciiString()) dato che
    // "codice modello"/"marca" sono piu' plausibilmente testo che un numero scalato.
    public static final int ID_MODEL_CODE = 0x16;
    public static final int ID_BRAND = 0x87;

    // CONFERMATO SUL CAMPO dall'utente (2026-07-23): ID_TRIP e' il contatore km giusto da
    // usare per i viaggi (al posto del totalizzatore ID_TOTAL_MILEAGE, che restava intero
    // senza decimali). Si azzera da solo ad ogni accensione del motore - percio' non puo'
    // essere letto come baseline-snapshot-e-sottrazione come ID_TOTAL_MILEAGE, va invece
    // accumulato per differenza continua (vedi TrackingService: ad ogni lettura si somma
    // il delta rispetto alla lettura precedente, trattando un valore piu' basso del
    // precedente come "appena resettato" invece che come delta negativo). Decodifica
    // confermata sul dispatcher di SVSetting.apk (smali_classes2/com/desaysv/present/a/a/f$1.smali,
    // metodo updateUIStatus, blocco "cond_25", stessa formula usata per SUM_FUEL/0x18):
    // combina TUTTI E 4 gli elementi dell'array come singoli byte big-endian in un intero a
    // 32 bit ((arr[0]<<24)|(arr[1]<<16)|(arr[2]<<8)|arr[3]), poi moltiplica per 0.1f - vedi
    // decodeFullBigEndianInt().
    public static final int ID_TRIP = 0x1c;

    // Ogni riga: {modulo, cmdId}
    private static final int[][] POLL_TARGETS = {
        {MODULE_NEW_ENERGY, ID_DRIVE_MODE},
        // ID_ENERGY_FLOW/ID_ENERGY_RECYCLE_LEVEL rimossi da qui: hanno un giro di poll
        // dedicato piu' veloce (vedi fastPollRunnable) - il giro normale a 2s+ risultava
        // troppo in ritardo per valori che cambiano in tempo reale mentre si guida (flusso
        // energia) o che il guidatore stesso cambia (rigenerazione, es. tasto volante) e si
        // aspetta di vedere aggiornati quasi subito - richiesta utente 2026-08-02.
        {MODULE_NEW_ENERGY, ID_TOTAL_MILEAGE},
        // ID_EV_MILEAGE/ID_HEV_MILEAGE rimossi dal poll - vedi commento sulle costanti sopra.
        {MODULE_NEW_ENERGY, ID_DISPLAY_SOC},
        {MODULE_NEW_ENERGY, ID_DISPLAY_MILEAGE},
        // ID_VEHICLE_MODE_ID rimosso: confermato sul campo che restituisce sempre
        // IS_NULL su questa auto (non supportato), inutile intasare il log.
        {MODULE_READONLY_INFO, ID_LOW_FUEL_WARNING},
        {MODULE_READONLY_INFO, ID_SUM_FUEL},
        {MODULE_READONLY_INFO, ID_AVG_FUEL_CONS},
        {MODULE_READONLY_INFO, ID_AVERAGE_OIL_CONSUMPTION_AFTER_CLEAR},
        {MODULE_READONLY_INFO, ID_AVERAGE_OIL_CONSUMPTION_RECENTLY_50KM},
        {MODULE_READONLY_INFO, ID_FUEL_PERCENT},
        {MODULE_READONLY_INFO, ID_INSTANTANEOUS_CONSUMPTION},
        {MODULE_READONLY_INFO, ID_ENDURANCE_KM},
        {MODULE_READONLY_INFO, ID_TOTAL_RANGE},
        {MODULE_READONLY_INFO, ID_TIRE_PRESSURE_WARNING},
        // ID_TIRE_PRESSURE (0x8c, il valore numerico PSI/kPa) rimosso dal poll (2026-08-02):
        // confermato sul campo IS_NULL su OGNI singolo poll per un'intera giornata di guida
        // (mattina/sera/notte, dozzine di cicli) - non supportato su quest'auto, stessa
        // situazione gia' vista per ID_VEHICLE_MODE_ID. ID_TIRE_PRESSURE_WARNING invece
        // risponde sempre (mai IS_NULL, anche se e' rimasto su raw=[0]=nessun avviso per
        // tutta la giornata) - segnale vivo, resta nel poll.
        // ID_VIN/ID_VIN_ALT rimossi dal poll (2026-08-02): il VIN vero e' irraggiungibile da
        // JaeDrive (vedi commento su MODULE_DOANOSE) - l'app usa direttamente "ivi.sn" come
        // identificativo, nessuna lettura elettronica del VIN piu' tentata.
        // ID_MODEL_CODE/ID_BRAND rimossi dal poll (2026-07-25): erano un tentativo
        // sperimentale di rilevazione automatica, mai decodificabile in modo affidabile
        // (vedi note sui due campi qui sopra) - marca/modello/motorizzazione arrivano ora
        // dall'onboarding esplicito dell'utente (vedi MainActivity/VehicleInfoPrefs),
        // molto piu' affidabile di un segnale VDB senza caller di riferimento.
        {MODULE_READONLY_INFO, ID_TRIP},
    };

    // Chiave univoca combinando modulo+cmdId, usata sia internamente che verso il Listener
    // (utile perche' lo stesso cmdId numerico potrebbe teoricamente ricorrere in moduli diversi).
    public static int keyFor(int module, int cmdId) {
        return (module << 8) | (cmdId & 0xFF);
    }

    // Molti campi (ODO, SUM_FUEL, ...) impacchettano il valore vero negli ultimi due
    // elementi dell'array come intero a 16 bit big-endian (verificato sul campo per
    // ID_TOTAL_MILEAGE contro l'ODO reale del cruscotto). Utility condivisa.
    public static int decodeLastTwoAsInt(int[] value) {
        if (value == null || value.length == 0) return 0;
        if (value.length == 1) return value[0];
        return value[value.length - 2] * 256 + value[value.length - 1];
    }

    // Variante che combina i PRIMI due elementi invece degli ultimi due - necessaria per
    // ID_DISPLAY_MILEAGE (vedi il suo commento sopra: dispatcher confermato che legge
    // arr[0]/arr[1], non gli ultimi due). Stessa formula usata inline per SOC/fuel% in
    // MainActivity.updateFooterStatus(). Equivalente a decodeLastTwoAsInt() solo se l'array
    // ha esattamente 2 elementi.
    public static int decodeFirstTwoAsInt(int[] value) {
        if (value == null || value.length == 0) return 0;
        if (value.length == 1) return value[0];
        return (value[0] & 0xFF) * 256 + (value[1] & 0xFF);
    }

    // Combina TUTTI gli elementi dell'array come singoli byte big-endian in un intero a 32
    // bit (arr[0] e' il piu' significativo). Verificato byte-per-byte contro il dispatcher
    // di SVSetting.apk (vedi commento su ID_TRIP). Diverso da decodeLastTwoAsInt(): quello
    // usa solo gli ultimi due elementi, corretto per ODO/SUM_FUEL perche' i byte piu' alti
    // sono sempre 0 in pratica, ma la formula generale (usata li' dal codice originale Desay)
    // e' questa a 4 byte.
    public static long decodeFullBigEndianInt(int[] value) {
        if (value == null || value.length == 0) return 0;
        long result = 0;
        for (int v : value) {
            result = (result << 8) | (v & 0xFF);
        }
        return result;
    }

    // Ipotesi di decodifica per segnali stringa (es. VIN): ogni elemento dell'array e' il
    // codice ASCII di un carattere. Non confermata sul campo - nessun caller di riferimento
    // trovato nei decompile di SVSetting/DSA che chiami questo specifico segnale. Filtra ai
    // soli caratteri validi in un VIN (lettere maiuscole e cifre, escluse I/O/Q per lo standard
    // VIN reale ma qui non escluse per non perdere dati utili alla diagnosi) e si ferma al primo
    // carattere non valido dopo l'inizio (probabile padding/terminatore/zero finale).
    public static String decodeAsciiString(int[] value) {
        if (value == null || value.length == 0) return null;
        StringBuilder sb = new StringBuilder();
        for (int v : value) {
            char c = (char) v;
            boolean valid = (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
            if (valid) {
                sb.append(c);
            } else if (sb.length() > 0) {
                break;
            }
        }
        return sb.length() > 0 ? sb.toString() : null;
    }

    // Etichetta testuale per ID_ENERGY_RECYCLE_LEVEL - scala confermata sul campo
    // 2026-08-02 (vedi commento sulla costante): 0=ALTO, 1=MEDIO, 2=BASSO. Un valore fuori
    // da questi tre (non ancora visto) torna il numero grezzo invece di inventare
    // un'etichetta, coerente col resto del progetto (mai un'ipotesi non confermata mostrata
    // come fosse un dato certo).
    public static String regenLevelLabel(Context ctx, int raw) {
        switch (raw) {
            case 0: return ctx.getString(R.string.regen_level_high);
            case 1: return ctx.getString(R.string.regen_level_medium);
            case 2: return ctx.getString(R.string.regen_level_low);
            default: return String.valueOf(raw);
        }
    }

    public interface Listener {
        void onLog(String msg);
        void onValue(int key, int[] value);
        void onBindStateChanged(boolean bound);
    }

    private final Context context;
    private final Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private IVDBus vdBus;
    private boolean polling = false;
    private boolean bound = false;

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            listener.onLog("VDB CAR_INFO connesso: " + name);
            vdBus = IVDBus.Stub.asInterface(binder);
            bound = true;
            listener.onBindStateChanged(true);
            startPolling();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            listener.onLog("VDB CAR_INFO disconnesso");
            vdBus = null;
            bound = false;
            listener.onBindStateChanged(false);
            stopPolling();
        }
    };

    public VDInfoClient(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    public void connect() {
        Intent intent = new Intent(CARINFO_ACTION);
        intent.setPackage(CARINFO_PKG);
        try {
            boolean ok = context.bindService(intent, connection, Context.BIND_AUTO_CREATE);
            listener.onLog("bindService CAR_INFO: " + (ok ? "avviato" : "FALLITO (bindService=false)"));
        } catch (Exception e) {
            listener.onLog("Errore bindService CAR_INFO: " + e);
        }
    }

    public void disconnect() {
        stopPolling();
        if (bound) {
            try {
                context.unbindService(connection);
            } catch (Exception ignored) {
            }
            bound = false;
        }
    }

    private void startPolling() {
        if (polling) return;
        polling = true;
        handler.post(pollRunnable);
        handler.postDelayed(fastPollRunnable, FAST_POLL_INTERVAL_MS);
    }

    private void stopPolling() {
        polling = false;
        handler.removeCallbacks(pollRunnable);
        handler.removeCallbacks(fastPollRunnable);
    }

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!polling || vdBus == null) return;
            for (int[] target : POLL_TARGETS) {
                queryOne(target[0], target[1]);
            }
            handler.postDelayed(this, POLL_INTERVAL_MS);
        }
    };

    // Giro di poll dedicato, piu' frequente, per i pochi segnali che cambiano in tempo
    // reale mentre si guida o che il guidatore stesso cambia (rigenerazione dal volante,
    // flusso energia che segue ogni variazione di trazione) - vedi commento sulla loro
    // rimozione da POLL_TARGETS sopra. 500ms invece di 2s+, senza velocizzare anche il giro
    // completo (che intasarebbe di traffico VDB/log tutti gli altri segnali molto meno
    // time-sensitive, es. VIN/pressione gomme/autonomia).
    private static final long FAST_POLL_INTERVAL_MS = 500;
    private static final int[][] FAST_POLL_TARGETS = {
        {MODULE_NEW_ENERGY, ID_ENERGY_RECYCLE_LEVEL},
        {MODULE_NEW_ENERGY, ID_ENERGY_FLOW},
    };

    private final Runnable fastPollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!polling || vdBus == null) return;
            for (int[] target : FAST_POLL_TARGETS) {
                queryOne(target[0], target[1]);
            }
            handler.postDelayed(this, FAST_POLL_INTERVAL_MS);
        }
    };

    // Alcuni segnali restituiscono sempre IS_NULL su questa auto (confermato sul
    // campo) - loggare lo stesso identico esito ad ogni ciclo di poll (ogni 2s, per
    // sempre, moltiplicato per ogni istanza di VDInfoClient attiva) era la causa
    // principale del rallentamento segnalato aprendo il tab LOG: il buffer di testo
    // cresceva senza limite con migliaia di righe ripetute e inutili. Logghiamo un
    // esito solo al primo IS_NULL consecutivo, poi periodicamente (non ad ogni poll) -
    // la sola dedup "logga solo se cambia" lasciava un log lungo (es. un'intera sessione
    // di guida) SENZA alcuna riga per un segnale rimasto IS_NULL fin dall'inizio, se
    // quell'unica riga iniziale scorreva fuori dal buffer visibile del tab LOG prima che
    // l'utente salvasse il log - reso evidente verificando un log di 2+ ore per il TPMS,
    // dove non compariva nessun esito per ID_TIRE_PRESSURE nonostante fosse polled.
    private final Map<Integer, Integer> consecutiveNullCount = new HashMap<>();
    private static final int NULL_REANNOUNCE_CYCLES = 150; // ~5 minuti a 2s/poll

    private void queryOne(int module, int cmdId) {
        int key = keyFor(module, cmdId);
        try {
            Bundle payload = new Bundle();
            payload.putInt("CMD_ID", cmdId);
            VDEvent request = new VDEvent(module, payload);
            VDEvent response = vdBus.get(request);
            if (response == null) {
                logIfChanged(key, module, cmdId, "risposta NULL");
                return;
            }
            Bundle result = response.getPayload();
            if (result == null) {
                logIfChanged(key, module, cmdId, "payload risposta NULL");
                return;
            }
            boolean isNull = result.getBoolean("IS_NULL", false);
            int[] value = result.getIntArray("VALUE");
            if (isNull || value == null) {
                logIfChanged(key, module, cmdId, "IS_NULL/valore assente");
                return;
            }
            consecutiveNullCount.remove(key);
            listener.onValue(key, value);
        } catch (Exception e) {
            listener.onLog(String.format("Errore get modulo=0x%x CMD_ID=0x%x: %s", module, cmdId, e));
        }
    }

    private void logIfChanged(int key, int module, int cmdId, String reason) {
        int count = consecutiveNullCount.getOrDefault(key, 0) + 1;
        consecutiveNullCount.put(key, count);
        if (count == 1 || count % NULL_REANNOUNCE_CYCLES == 0) {
            listener.onLog(String.format("modulo=0x%x CMD_ID=0x%x: %s", module, cmdId, reason));
        }
    }
}
