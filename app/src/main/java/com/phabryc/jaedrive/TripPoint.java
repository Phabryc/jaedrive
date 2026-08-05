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
    // Campi upload-only (mai mostrati nella UI dell'app in auto, vedi TrackingService) -
    // -1/-1f se non disponibili nel punto GPX (estensioni assenti, es. traccia registrata
    // prima che questi campi esistessero).
    public final int driveMode;         // 0/1/2 = ECO/NORMAL/SPORT
    public final float speedKmh;        // velocita' GPS
    public final float instConsumption; // valore grezzo, scala non confermata
    // Valore grezzo (0/1/2) - scala confermata sul campo 2026-08-02, vedi
    // VDInfoClient.regenLevelLabel() per la conversione in ALTO/MEDIO/BASSO.
    public final int regenLevel;
    // Istante del punto (<time> del trkpt) - 0 se non disponibile (mai il caso per una
    // traccia scritta da TrackingService, che lo include sempre; solo per robustezza).
    public final long timeMillis;
    // Non-null SOLO per il punto sintetico di pausa inserito da TripMerger tra due
    // viaggi uniti (2026-08-05) - rappresenta l'istante di ripresa (fine pausa), mentre
    // timeMillis di questo stesso punto e' l'istante di inizio pausa (fine del viaggio
    // precedente). Un punto normale della traccia ha sempre pauseEndMillis == null.
    public final Long pauseEndMillis;

    public TripPoint(double lat, double lon, int energyFlow) {
        this(lat, lon, energyFlow, -1f, -1f);
    }

    public TripPoint(double lat, double lon, int energyFlow, float batteryPct, float fuelPct) {
        this(lat, lon, energyFlow, batteryPct, fuelPct, -1, -1f, -1f, -1, 0, null);
    }

    public TripPoint(double lat, double lon, int energyFlow, float batteryPct, float fuelPct,
                      int driveMode, float speedKmh, float instConsumption, int regenLevel) {
        this(lat, lon, energyFlow, batteryPct, fuelPct, driveMode, speedKmh, instConsumption, regenLevel, 0, null);
    }

    public TripPoint(double lat, double lon, int energyFlow, float batteryPct, float fuelPct,
                      int driveMode, float speedKmh, float instConsumption, int regenLevel,
                      long timeMillis, Long pauseEndMillis) {
        this.lat = lat;
        this.lon = lon;
        this.energyFlow = energyFlow;
        this.batteryPct = batteryPct;
        this.fuelPct = fuelPct;
        this.driveMode = driveMode;
        this.speedKmh = speedKmh;
        this.instConsumption = instConsumption;
        this.regenLevel = regenLevel;
        this.timeMillis = timeMillis;
        this.pauseEndMillis = pauseEndMillis;
    }
}
