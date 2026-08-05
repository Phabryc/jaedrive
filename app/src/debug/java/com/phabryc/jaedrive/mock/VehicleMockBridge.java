package com.phabryc.jaedrive.mock;

import android.content.Context;

import com.phabryc.jaedrive.VDInfoClient;

// Solo build Debug - vedi la variante No-Op in src/release/java/.../mock/VehicleMockBridge.java
// (stesso nome pienamente qualificato, mai compresenti nello stesso sourceSet). Intercetta il
// fallimento del bind verso il vero servizio VDB Desay (com.desaysv.ivi.vds.carinfo, non
// presente su nessun emulatore/dispositivo diverso dalla vettura reale) e attacca
// VehicleSimulator al suo posto, cosi' l'app mostra dati fittizi ma dinamici invece di restare
// tutta a trattini durante lo sviluppo/test - vedi agent/SIMULATOR.md.
public class VehicleMockBridge {

    public static void onBindFailed(Context context, VDInfoClient.Listener listener) {
        listener.onLog("[EMULAZIONE DEBUG] Bus VDB OEM non rilevato. Avvio VehicleSimulator per test su Emulatore...");
        listener.onBindStateChanged(true);
        VehicleSimulator.getInstance().register(listener);
    }

    public static void onDisconnect(VDInfoClient.Listener listener) {
        VehicleSimulator.getInstance().unregister(listener);
    }
}
