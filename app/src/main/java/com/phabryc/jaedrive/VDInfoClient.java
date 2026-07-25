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
    // MODULE_DOANOSE ("diagnose", refuso nel nome originale Desay): confermato sul campo
    // che ID_VIN=0x9/MODULE_READONLY_INFO restituisce sempre IS_NULL su questa auto (non
    // e' un problema di decodifica, il segnale e' proprio assente li'). Secondo candidato
    // trovato nel decompile: DiagnosisID.ID_VIN=0x10 sotto questo modulo, che il dispatcher
    // (smali com/desaysv/ivi/vds/carinfo/a/a.smali) mappa comunque a un handler concreto
    // (non e' una costante dichiarata a vuoto) - percio' vale la pena tentarlo.
    public static final int MODULE_DOANOSE = 0x50007;

    // com.desaysv.ivi.extra.project.carinfo.NewEnergyID
    public static final int ID_DRIVE_MODE      = 0x4;
    public static final int ID_ENERGY_FLOW     = 0x8;
    public static final int ID_TOTAL_MILEAGE   = 0x2e;
    public static final int ID_EV_MILEAGE      = 0x36;
    public static final int ID_HEV_MILEAGE     = 0x32;
    public static final int ID_DISPLAY_SOC     = 0x2c;
    public static final int ID_VEHICLE_MODE_ID = 0x78;
    // Confermato REALE (non solo "registrato ma senza caller"): il dispatcher UI di
    // SVSetting.apk (smali_classes2/com/desaysv/present/a/a/f$1.smali, metodo
    // updateUIStatus) ha un ramo esplicito per modulo=MODULE_NEW_ENERGY/cmdId=0x25 che
    // chiama onEnergyRecycleLevelChanged(int) con un valore letto da getItemValue()
    // (percorso "valore singolo", non un combine a 16 bit come i campi carburante) -
    // livello di rigenerazione in frenata. Scala/range esatti non confermati (nessun
    // caller mostra come formatta il numero in UI), salvato come intero grezzo.
    public static final int ID_ENERGY_RECYCLE_LEVEL = 0x25;

    // com.desaysv.ivi.extra.project.carinfo.ReadOnlyID (carburante/consumi)
    public static final int ID_LOW_FUEL_WARNING    = 0x2;
    public static final int ID_SUM_FUEL            = 0x18;
    public static final int ID_AVG_FUEL_CONS       = 0x1e;
    public static final int ID_AVERAGE_OIL_CONSUMPTION_AFTER_CLEAR = 0x25;
    public static final int ID_AVERAGE_OIL_CONSUMPTION_RECENTLY_50KM = 0x24;
    public static final int ID_FUEL_PERCENT        = 0x44;
    public static final int ID_INSTANTANEOUS_CONSUMPTION = 0x46;
    // Trovato nel decompile di SVVDSCarInfo.apk (com.desaysv.ivi.extra.project.carinfo.ReadOnlyID),
    // stesso modulo READONLY_INFO gia' confermato funzionante per i segnali carburante. Nessun
    // caller di riferimento trovato nei decompile per capire il formato esatto del valore
    // (probabile stringa, non un numero scalato come gli altri campi di questo modulo) - vedi
    // decodeAsciiString(). Non ancora testato sul campo.
    public static final int ID_VIN = 0x9;

    // com.desaysv.ivi.extra.project.carinfo.DiagnosisID - secondo candidato per il VIN
    // (vedi commento su MODULE_DOANOSE). Anche qui nessun caller di riferimento trovato.
    public static final int ID_VIN_ALT = 0x10;

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
        {MODULE_NEW_ENERGY, ID_ENERGY_FLOW},
        {MODULE_NEW_ENERGY, ID_TOTAL_MILEAGE},
        {MODULE_NEW_ENERGY, ID_EV_MILEAGE},
        {MODULE_NEW_ENERGY, ID_HEV_MILEAGE},
        {MODULE_NEW_ENERGY, ID_DISPLAY_SOC},
        {MODULE_NEW_ENERGY, ID_ENERGY_RECYCLE_LEVEL},
        // ID_VEHICLE_MODE_ID rimosso: confermato sul campo che restituisce sempre
        // IS_NULL su questa auto (non supportato), inutile intasare il log.
        {MODULE_READONLY_INFO, ID_LOW_FUEL_WARNING},
        {MODULE_READONLY_INFO, ID_SUM_FUEL},
        {MODULE_READONLY_INFO, ID_AVG_FUEL_CONS},
        {MODULE_READONLY_INFO, ID_AVERAGE_OIL_CONSUMPTION_AFTER_CLEAR},
        {MODULE_READONLY_INFO, ID_AVERAGE_OIL_CONSUMPTION_RECENTLY_50KM},
        {MODULE_READONLY_INFO, ID_FUEL_PERCENT},
        {MODULE_READONLY_INFO, ID_INSTANTANEOUS_CONSUMPTION},
        {MODULE_READONLY_INFO, ID_VIN},
        {MODULE_DOANOSE, ID_VIN_ALT},
        {MODULE_DOANOSE, ID_MODEL_CODE},
        {MODULE_DOANOSE, ID_BRAND},
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
    }

    private void stopPolling() {
        polling = false;
        handler.removeCallbacks(pollRunnable);
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

    // Segnali come ID_VIN restituiscono sempre IS_NULL su questa auto (confermato sul
    // campo) - loggare lo stesso identico esito ad ogni ciclo di poll (ogni 2s, per
    // sempre, moltiplicato per ogni istanza di VDInfoClient attiva) era la causa
    // principale del rallentamento segnalato aprendo il tab LOG: il buffer di testo
    // cresceva senza limite con migliaia di righe ripetute e inutili. Logghiamo un
    // esito solo quando CAMBIA rispetto al ciclo precedente (per key modulo+cmdId),
    // non ad ogni singolo poll.
    private final Map<Integer, Boolean> lastNullState = new HashMap<>();

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
            lastNullState.put(key, false);
            listener.onValue(key, value);
        } catch (Exception e) {
            listener.onLog(String.format("Errore get modulo=0x%x CMD_ID=0x%x: %s", module, cmdId, e));
        }
    }

    private void logIfChanged(int key, int module, int cmdId, String reason) {
        Boolean wasNull = lastNullState.get(key);
        lastNullState.put(key, true);
        if (wasNull != null && wasNull) return; // stesso esito del ciclo precedente, non ripetere
        listener.onLog(String.format("modulo=0x%x CMD_ID=0x%x: %s", module, cmdId, reason));
    }
}
