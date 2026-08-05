package com.phabryc.jaedrive.mock;

import android.content.Context;

import com.phabryc.jaedrive.VDInfoClient;

// Variante No-Op per le build di Release - vedi src/debug/java/.../mock/VehicleMockBridge.java
// per l'implementazione vera. Nessuna classe/risorsa di simulazione finisce nell'APK di
// produzione installato in auto: questi due metodi non fanno letteralmente nulla.
public class VehicleMockBridge {

    public static void onBindFailed(Context context, VDInfoClient.Listener listener) {
        // No-Op: su un dispositivo di produzione (la vettura reale) il bind non dovrebbe mai
        // fallire; se succede, resta un fallimento vero da vedere in log, nessuna simulazione.
    }

    public static void onDisconnect(VDInfoClient.Listener listener) {
        // No-Op.
    }
}
