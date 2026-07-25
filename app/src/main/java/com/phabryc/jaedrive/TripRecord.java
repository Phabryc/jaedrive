package com.phabryc.jaedrive;

// Un viaggio concluso (automatico via GPS/marcia, o manuale via reset utente),
// cosi' come persistito in TripDatabase.
public class TripRecord {

    public static final String TYPE_AUTO = "AUTO";
    public static final String TYPE_MANUAL = "MANUAL";

    public long id;
    public String type;
    public long startTime;
    public long endTime;
    // Non piu' derivati da un odometro (ID_TOTAL_MILEAGE, solo interi): conservati per
    // compatibilita' di schema col database gia' presente sul dispositivo dell'utente
    // (mai letti/mostrati altrove nell'app), popolati solo quando disponibili senza
    // pretesa di precisione - vedi kmDelta per la distanza vera del viaggio.
    public int startKm;
    public int endKm;
    // Distanza vera del viaggio: fonte ID_TRIP (VDInfoClient), accumulata per differenza
    // continua da TrackingService/ManualTripComputer invece che da una sottrazione
    // start/end (ID_TRIP si azzera da solo ad ogni accensione del motore). Ha un decimale
    // di precisione reale (es. 54.3 km), a differenza del vecchio calcolo basato sull'odometro.
    public double kmDelta;
    public int startFuelRaw;
    public int endFuelRaw;
    public Double litersDelta;
    public Double avgConsumption;
    public String gpxPath; // solo AUTO
    public String logPath; // solo AUTO
    // AUTO: indirizzo di destinazione (reverse geocoding via Nominatim/OSM, solo se
    // c'era connessione a fine viaggio). MANUAL: etichetta dello slot (Trip A/Trip B o
    // nome personalizzato) al momento del reset. Nullable in entrambi i casi.
    public String label;
    // Indirizzo di PARTENZA (reverse geocoding dal primo punto GPS) - solo AUTO, sempre
    // null per i MANUAL (non hanno una traccia GPS propria). Impostato dal chiamante dopo
    // la costruzione (non nel costruttore, per non dover toccare tutti i call site
    // esistenti che non lo passano mai) - vedi TrackingService.saveTripRecordAsync().
    public String startLabel;
    // true SOLO per i record "virtuali" costruiti al volo da MainActivity per mostrare
    // nello Storico i trip computer manuali ancora aperti (non ancora resettati) - non
    // esistono in TripDatabase, id e' un sentinel negativo (vedi MainActivity.refreshTrackList()).
    public boolean ongoing;

    // Stato di sincronizzazione col cloud JaeDrive (vedi SyncWorker/CloudApiClient) - un
    // trip appena inserito parte sempre non caricato, SyncWorker aggiorna questi due campi
    // (TripDatabase.markUploaded()) dopo un upload riuscito. cloudTripId e' l'id restituito
    // dal server, non usato per altro che diagnosi/debug.
    public boolean uploaded;
    public String cloudTripId;
    // "A" o "B" - solo per TYPE_MANUAL (quale slot l'ha generato), null per TYPE_AUTO.
    // Serve perche' r.label e' rinominabile dall'utente (vedi showEditLabelDialog) e quindi
    // non e' un identificatore affidabile dello slot d'origine - usato per popolare il
    // campo "kind" ('manual_a'/'manual_b') nel payload di upload cloud, vedi SyncWorker.
    public String manualSlot;
    // Generato da TripDatabase.insertTrip() se non gia' impostato - identificatore stabile
    // usato come chiave di idempotenza primaria dal server cloud (vedi TripDatabase per il
    // dettaglio, e SyncWorker per l'invio nel payload di upload).
    public String clientUuid;
    // Km reali in modalita' EV/HEV, per differenza sui contatori-odometro ID_EV_MILEAGE/
    // ID_HEV_MILEAGE tra apertura e chiusura del viaggio (vedi TrackingService) - null se
    // non disponibili (es. baseline mancante all'apertura). Solo AUTO, mai per i MANUAL.
    // Complementare, non sostitutivo, alla stima pctEv/pctSeries/pctParallel basata sul
    // tempo passato in ciascun bucket ENERGY_FLOW (vedi SyncWorker/EnergyFlowUtil).
    public Double kmEv;
    public Double kmHev;

    // Usato da TripDatabase per ricostruire i record letti dal db.
    public TripRecord() {
    }

    public TripRecord(String type, long startTime, long endTime, int startKm, int endKm, double kmDelta,
                       int startFuelRaw, int endFuelRaw, Double litersDelta, Double avgConsumption,
                       String gpxPath, String logPath, String label) {
        this.type = type;
        this.startTime = startTime;
        this.endTime = endTime;
        this.startKm = startKm;
        this.endKm = endKm;
        this.kmDelta = kmDelta;
        this.startFuelRaw = startFuelRaw;
        this.endFuelRaw = endFuelRaw;
        this.litersDelta = litersDelta;
        this.avgConsumption = avgConsumption;
        this.gpxPath = gpxPath;
        this.logPath = logPath;
        this.label = label;
    }
}
