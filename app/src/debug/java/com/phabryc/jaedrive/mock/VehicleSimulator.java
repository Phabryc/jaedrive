package com.phabryc.jaedrive.mock;

import android.os.Handler;
import android.os.Looper;

import com.phabryc.jaedrive.VDInfoClient;

import java.util.ArrayList;
import java.util.List;

// Generatore di telemetria fittizia, SOLO build Debug (vedi VehicleMockBridge) - usato per
// testare JaeDrive su un emulatore/dispositivo Android Automotive dove il bus VDB Desay reale
// (com.desaysv.ivi.vds.carinfo) non esiste. Singleton process-wide: sia MainActivity che
// TrackingService creano ciascuno il proprio VDInfoClient/Listener (vedi VDInfoClient.java) -
// registrandoli entrambi sullo STESSO simulatore, vedono uno stato coerente invece di due
// mondi fittizi scollegati.
//
// Le formule di ri-codifica sotto (valore "umano" -> bytes grezzi) sono lo specchio esatto
// delle formule di decodifica gia' verificate sul campo in MainActivity.updateFooterStatus()/
// TrackingService.handleTripKm()/handleFuel() - vedi commento su ciascun campo.
public class VehicleSimulator {

    private static VehicleSimulator instance;

    public static synchronized VehicleSimulator getInstance() {
        if (instance == null) instance = new VehicleSimulator();
        return instance;
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<VDInfoClient.Listener> listeners = new ArrayList<>();

    // Stato simulato "fisico" (post-decodifica, in unita' umane).
    private float socPct = 82f;
    private float fuelPct = 68f;
    private double tripKm = 0;
    private double sumFuelLiters = 0;
    private int enduranceKm = 340;
    // Ciclo di flusso energetico plausibile (vedi EnergyFlowUtil.bucketFor()): IDLE(3) ->
    // EV(2) -> PARALLELO(8) -> REGEN/CHR(16) -> SERIE(4) -> EV(2) -> ...
    private final int[] energyFlowCycle = {3, 2, 2, 8, 8, 16, 4, 2, 2, 8, 16, 16};
    private int energyFlowCycleIndex = 0;
    private int regenLevel = 1;

    private VehicleSimulator() {
    }

    public synchronized void register(VDInfoClient.Listener listener) {
        boolean wasEmpty = listeners.isEmpty();
        if (!listeners.contains(listener)) listeners.add(listener);
        if (wasEmpty) {
            handler.post(fastTick);
            handler.postDelayed(slowTick, 2000);
        }
        // Placeholder immediato per questo listener, non aspettare il prossimo tick - stesso
        // principio gia' usato altrove nell'app (es. MainActivity.refreshCloudSection()).
        List<VDInfoClient.Listener> only = new ArrayList<>();
        only.add(listener);
        pushSlow(only);
        pushFast(only);
    }

    public synchronized void unregister(VDInfoClient.Listener listener) {
        listeners.remove(listener);
    }

    private synchronized List<VDInfoClient.Listener> currentListeners() {
        return new ArrayList<>(listeners);
    }

    // Giro veloce (500ms), stesso ritmo del FAST_POLL_TARGETS reale (flusso energia +
    // rigenerazione, gli unici due segnali che cambiano abbastanza in fretta da giustificarlo).
    // Si auto-ferma (niente reschedule) quando l'ultimo listener si disiscrive, invece di
    // girare per sempre a vuoto.
    private final Runnable fastTick = new Runnable() {
        @Override
        public void run() {
            List<VDInfoClient.Listener> targets = currentListeners();
            if (targets.isEmpty()) return;
            energyFlowCycleIndex = (energyFlowCycleIndex + 1) % energyFlowCycle.length;
            regenLevel = (regenLevel + 1) % 3;
            pushFast(targets);
            handler.postDelayed(this, 500);
        }
    };

    // Giro lento (2s), stesso ritmo del POLL_TARGETS reale.
    private final Runnable slowTick = new Runnable() {
        @Override
        public void run() {
            List<VDInfoClient.Listener> targets = currentListeners();
            if (targets.isEmpty()) return;
            advancePhysics();
            pushSlow(targets);
            handler.postDelayed(this, 2000);
        }
    };

    private boolean isMovingBucket() {
        int flow = energyFlowCycle[energyFlowCycleIndex];
        return flow != 1 && flow != 3 && flow != 6 && flow != 7 && flow != 9 && flow != 14;
    }

    private boolean isBurningFuel() {
        int flow = energyFlowCycle[energyFlowCycleIndex];
        return flow == 4 || flow == 5 || flow == 8 || flow == 10 || flow == 11;
    }

    // Delta volutamente piccolo (max 0.03 km/tick) - ben sotto i 10 km che
    // TrackingService.handleTripKm() userebbe per scartare un valore come "spurio"
    // (MAX_PLAUSIBLE_KM_DELTA), cosi' l'accumulo del viaggio simulato funziona come quello vero.
    private void advancePhysics() {
        if (isMovingBucket()) {
            tripKm += 0.03;
            enduranceKm = Math.max(0, enduranceKm - 1);
            if (isBurningFuel()) {
                sumFuelLiters += 0.0015;
                fuelPct = Math.max(0f, fuelPct - 0.01f);
            } else {
                socPct = Math.max(0f, socPct - 0.05f);
            }
        }
    }

    private void pushFast(List<VDInfoClient.Listener> targets) {
        int flow = energyFlowCycle[energyFlowCycleIndex];
        broadcast(targets, VDInfoClient.keyFor(VDInfoClient.MODULE_NEW_ENERGY, VDInfoClient.ID_ENERGY_FLOW), new int[]{flow});
        broadcast(targets, VDInfoClient.keyFor(VDInfoClient.MODULE_NEW_ENERGY, VDInfoClient.ID_ENERGY_RECYCLE_LEVEL), new int[]{regenLevel});
    }

    private void pushSlow(List<VDInfoClient.Listener> targets) {
        // ID_DRIVE_MODE: raw value[0], nessuna scala - 1 = NORMAL.
        broadcast(targets, VDInfoClient.keyFor(VDInfoClient.MODULE_NEW_ENERGY, VDInfoClient.ID_DRIVE_MODE), new int[]{1});

        // ID_DISPLAY_SOC/ID_FUEL_PERCENT: combine dei PRIMI due elementi (vedi
        // MainActivity.updateFooterStatus(): "value[0]*256 + value[1]"), quindi basta un
        // array a 2 elementi - /100 per il SOC, /10 per il carburante lato ricevente.
        int socRaw = Math.round(socPct * 100);
        broadcast(targets, VDInfoClient.keyFor(VDInfoClient.MODULE_NEW_ENERGY, VDInfoClient.ID_DISPLAY_SOC),
            new int[]{(socRaw >> 8) & 0xFF, socRaw & 0xFF});

        int fuelRaw = Math.round(fuelPct * 10);
        broadcast(targets, VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_FUEL_PERCENT),
            new int[]{(fuelRaw >> 8) & 0xFF, fuelRaw & 0xFF});

        // ID_SUM_FUEL: decodeLastTwoAsInt poi *0.1f (vedi TrackingService.handleFuel()).
        int sumFuelRaw = (int) Math.round(sumFuelLiters * 10);
        broadcast(targets, VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_SUM_FUEL),
            new int[]{(sumFuelRaw >> 8) & 0xFF, sumFuelRaw & 0xFF});

        // ID_TRIP: decodeFullBigEndianInt su TUTTI e 4 gli elementi, poi *0.1f (vedi
        // TrackingService.handleTripKm()).
        long tripRaw = Math.round(tripKm * 10);
        broadcast(targets, VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_TRIP),
            new int[]{
                (int) ((tripRaw >> 24) & 0xFF), (int) ((tripRaw >> 16) & 0xFF),
                (int) ((tripRaw >> 8) & 0xFF), (int) (tripRaw & 0xFF)
            });

        // ID_INSTANTANEOUS_CONSUMPTION: passthrough grezzo, nessuna scala confermata (vedi
        // TrackingService) - 0xFFFF e' il sentinella osservato sul campo per "fermo".
        int instConsumption = isMovingBucket() ? (150 + (int) (Math.random() * 250)) : 0xFFFF;
        broadcast(targets, VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_INSTANTANEOUS_CONSUMPTION),
            new int[]{(instConsumption >> 8) & 0xFF, instConsumption & 0xFF});

        // ID_TIRE_PRESSURE_WARNING: nessun decode implementato in-app (solo log grezzo) -
        // [0] = nessun avviso, coerente con quanto osservato sul campo.
        broadcast(targets, VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_TIRE_PRESSURE_WARNING), new int[]{0});

        // ID_ENDURANCE_KM: decodeFirstTwoAsInt, nessuna scala (vedi il campo "Range" in
        // Dashboard, MainActivity).
        broadcast(targets, VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_ENDURANCE_KM),
            new int[]{(enduranceKm >> 8) & 0xFF, enduranceKm & 0xFF});
    }

    private void broadcast(List<VDInfoClient.Listener> targets, int key, int[] value) {
        for (VDInfoClient.Listener l : targets) {
            l.onValue(key, value);
        }
    }
}
