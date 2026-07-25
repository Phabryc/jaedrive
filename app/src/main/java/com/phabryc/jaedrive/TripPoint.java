package com.phabryc.jaedrive;

// Punto della traccia GPS arricchito col valore ENERGY_FLOW campionato nello stesso
// istante (vedi TrackingService), usato per colorare i segmenti della traccia in base
// alla modalita' di funzionamento del gruppo propulsore ibrido.
public class TripPoint {
    public final double lat;
    public final double lon;
    public final int energyFlow; // -1 se non disponibile al momento del punto

    public TripPoint(double lat, double lon, int energyFlow) {
        this.lat = lat;
        this.lon = lon;
        this.energyFlow = energyFlow;
    }
}
