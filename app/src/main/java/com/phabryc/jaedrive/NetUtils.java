package com.phabryc.jaedrive;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

// Controllo di connettivita' condiviso: usato sia da MainActivity (decidere se mostrare
// la mappa OSM reale o il fallback offline) sia da TrackingService (decidere se provare
// il reverse geocoding della destinazione a fine viaggio).
public class NetUtils {

    // Verifica reale (non solo "rete presente" ma effettivamente convalidata dal sistema
    // con accesso a internet), tramite NetworkCapabilities.NET_CAPABILITY_VALIDATED.
    public static boolean hasInternet(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network active = cm.getActiveNetwork();
            if (active == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(active);
            return caps != null
                && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch (Exception e) {
            return false;
        }
    }
}
