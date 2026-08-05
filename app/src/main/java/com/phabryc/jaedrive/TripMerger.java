package com.phabryc.jaedrive;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Unione di 2+ viaggi AUTO consecutivi in un solo TripRecord con un'unica traccia GPX
// (richiesta esplicita utente 2026-08-05): utile per un viaggio interrotto da una pausa
// (es. pranzo), registrato da JaeDrive come piu' viaggi separati (il gear torna in PARK
// durante la sosta, chiudendo il primo e aprendone un altro alla ripartenza) ma che per
// l'utente e' un unico spostamento di cui vedere le statistiche insieme. Vedi
// MainActivity.mergeSelectedTrips() per la validazione (solo AUTO, solo consecutivi) e
// l'orchestrazione (file, DB, cloud) - questa classe si occupa solo del calcolo.
public class TripMerger {

    private static final Pattern TRKPT_PATTERN = Pattern.compile("<trkpt\\b.*?</trkpt>", Pattern.DOTALL);
    private static final Pattern LAT_PATTERN = Pattern.compile("lat=\"([-0-9.]+)\"");
    private static final Pattern LON_PATTERN = Pattern.compile("lon=\"([-0-9.]+)\"");
    private static final Pattern ELE_PATTERN = Pattern.compile("<ele>([-0-9.]+)</ele>");

    // Estrae i singoli elementi <trkpt>...</trkpt> COSI' COME SONO scritti nel file
    // originale (mai riparsati/ricostruiti campo per campo) - preserva esattamente tutte
    // le estensioni jd:* gia' presenti, comprese eventuali aggiunte da versioni future
    // dell'app che questa classe non conosce ancora.
    private static List<String> extractTrkpts(File gpxFile) {
        List<String> result = new ArrayList<>();
        if (gpxFile == null || !gpxFile.exists()) return result;
        try {
            String xml = new String(Files.readAllBytes(gpxFile.toPath()), StandardCharsets.UTF_8);
            Matcher m = TRKPT_PATTERN.matcher(xml);
            while (m.find()) result.add(m.group());
        } catch (IOException ignored) {
        }
        return result;
    }

    // Punto sintetico di pausa: stessa posizione dell'ultimo punto reale del viaggio che
    // finisce (l'auto resta ferma per l'intera sosta, niente da interpolare) - <time> e'
    // l'istante di fine di quel viaggio (inizio pausa), la nuova estensione
    // <jd:pauseEndTime> e' l'istante di inizio del viaggio successivo (fine pausa): le due
    // date insieme bastano a ricostruire la durata della sosta senza altri campi.
    private static String buildPauseTrkpt(String lastTrkptOfPrevTrip, long pauseStartMillis, long pauseEndMillis) {
        double lat = 0, lon = 0, ele = 0;
        Matcher latM = LAT_PATTERN.matcher(lastTrkptOfPrevTrip);
        if (latM.find()) lat = Double.parseDouble(latM.group(1));
        Matcher lonM = LON_PATTERN.matcher(lastTrkptOfPrevTrip);
        if (lonM.find()) lon = Double.parseDouble(lonM.group(1));
        Matcher eleM = ELE_PATTERN.matcher(lastTrkptOfPrevTrip);
        if (eleM.find()) ele = Double.parseDouble(eleM.group(1));
        String pauseStartIso = Instant.ofEpochMilli(pauseStartMillis).toString();
        String pauseEndIso = Instant.ofEpochMilli(pauseEndMillis).toString();
        return String.format(Locale.US,
            "<trkpt lat=\"%.6f\" lon=\"%.6f\"><ele>%.1f</ele><time>%s</time>"
                + "<extensions><jd:pauseEndTime>%s</jd:pauseEndTime></extensions></trkpt>",
            lat, lon, ele, pauseStartIso, pauseEndIso);
    }

    // I viaggi vanno passati gia' in ordine cronologico (vedi MainActivity.
    // mergeSelectedTrips(), che li ordina e valida l'adiacenza prima di chiamare qui).
    public static String buildMergedGpx(List<TripRecord> sortedTrips, String mergedFileName) {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<gpx version=\"1.1\" creator=\"JaeDrive\" xmlns=\"http://www.topografix.com/GPX/1/1\" xmlns:jd=\"https://jaedrive.app/gpx-ext\">\n");
        sb.append("  <trk><name>").append(mergedFileName).append("</name><trkseg>\n");
        String lastTrkpt = null;
        for (int i = 0; i < sortedTrips.size(); i++) {
            TripRecord trip = sortedTrips.get(i);
            List<String> trkpts = trip.gpxPath != null
                ? extractTrkpts(new File(trip.gpxPath))
                : Collections.emptyList();
            if (i > 0 && lastTrkpt != null) {
                long pauseStart = sortedTrips.get(i - 1).endTime;
                long pauseEnd = trip.startTime;
                sb.append("    ").append(buildPauseTrkpt(lastTrkpt, pauseStart, pauseEnd)).append("\n");
            }
            for (String trkpt : trkpts) {
                sb.append("    ").append(trkpt).append("\n");
            }
            if (!trkpts.isEmpty()) lastTrkpt = trkpts.get(trkpts.size() - 1);
        }
        sb.append("  </trkseg></trk>\n</gpx>\n");
        return sb.toString();
    }

    // Km/litri sommati, consumo medio RICALCOLATO da km/litri totali (non media delle
    // medie, sarebbe matematicamente sbagliata), partenza/arrivo dal primo/ultimo viaggio
    // della sequenza. logPath resta null: non esiste un log eventi unico sensato per un
    // viaggio ricostruito a posteriori da piu' sessioni separate di TrackingService.
    public static TripRecord buildMergedRecord(List<TripRecord> sortedTrips, String gpxPath) {
        TripRecord first = sortedTrips.get(0);
        TripRecord last = sortedTrips.get(sortedTrips.size() - 1);
        double kmDelta = 0;
        Double litersDelta = null;
        Double kmEv = null;
        Double kmHev = null;
        for (TripRecord t : sortedTrips) {
            kmDelta += t.kmDelta;
            if (t.litersDelta != null) litersDelta = (litersDelta == null ? 0 : litersDelta) + t.litersDelta;
            if (t.kmEv != null) kmEv = (kmEv == null ? 0 : kmEv) + t.kmEv;
            if (t.kmHev != null) kmHev = (kmHev == null ? 0 : kmHev) + t.kmHev;
        }
        Double avgConsumption = (litersDelta != null && litersDelta > 0) ? kmDelta / litersDelta : null;

        TripRecord merged = new TripRecord();
        merged.type = TripRecord.TYPE_AUTO;
        merged.startTime = first.startTime;
        merged.endTime = last.endTime;
        merged.startKm = first.startKm;
        merged.endKm = last.endKm;
        merged.kmDelta = kmDelta;
        merged.startFuelRaw = first.startFuelRaw;
        merged.endFuelRaw = last.endFuelRaw;
        merged.litersDelta = litersDelta;
        merged.avgConsumption = avgConsumption;
        merged.gpxPath = gpxPath;
        merged.logPath = null;
        merged.label = last.label;
        merged.startLabel = first.startLabel;
        merged.kmEv = kmEv;
        merged.kmHev = kmHev;
        return merged;
    }
}
