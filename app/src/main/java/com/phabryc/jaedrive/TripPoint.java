package com.phabryc.jaedrive;

// Punto della traccia GPS arricchito col valore ENERGY_FLOW campionato nello stesso
// istante (vedi TrackingService), usato per colorare i segmenti della traccia in base
// alla modalita' di funzionamento del gruppo propulsore ibrido.
public class TripPoint {
    public final double lat;
    public final double lon;
    public final int energyFlow; // -1 se non disponibile al momento del punto
    public final float batteryPct; // -1 se non disponibile - vedi TrackingService.buildGpx()
    public final float fuelPct;    // -1 se non disponibile - vedi TrackingService.buildGpx()

    public TripPoint(double lat, double lon, int energyFlow) {
        this(lat, lon, energyFlow, -1f, -1f);
    }

    public TripPoint(double lat, double lon, int energyFlow, float batteryPct, float fuelPct) {
        this.lat = lat;
        this.lon = lon;
        this.energyFlow = energyFlow;
        this.batteryPct = batteryPct;
        this.fuelPct = fuelPct;
    }
}
