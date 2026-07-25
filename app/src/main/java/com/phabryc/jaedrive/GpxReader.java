package com.phabryc.jaedrive;

import android.util.Xml;

import org.xmlpull.v1.XmlPullParser;

import java.io.File;
import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.List;

// Legge i punti (lat/lon + energy flow campionato) salvati in un file .gpx generato da
// TrackingService: usati per disegnare la traccia (reale o schematica offline) colorata
// per segmento nel dettaglio di un viaggio in Storico Viaggi, e per calcolare le
// percentuali EV/serie/parallelo dell'intero viaggio.
public class GpxReader {

    public static List<TripPoint> readPoints(File file) {
        List<TripPoint> points = new ArrayList<>();
        if (file == null || !file.exists()) return points;
        try (FileInputStream in = new FileInputStream(file)) {
            XmlPullParser parser = Xml.newPullParser();
            parser.setInput(in, "UTF-8");
            int eventType = parser.getEventType();

            boolean inTrkpt = false;
            boolean inEnergyFlow = false;
            double lat = 0, lon = 0;
            int energyFlow = -1;

            while (eventType != XmlPullParser.END_DOCUMENT) {
                switch (eventType) {
                    case XmlPullParser.START_TAG: {
                        String name = parser.getName();
                        if ("trkpt".equals(name)) {
                            inTrkpt = true;
                            energyFlow = -1;
                            lat = parseOrZero(parser.getAttributeValue(null, "lat"));
                            lon = parseOrZero(parser.getAttributeValue(null, "lon"));
                        } else if (inTrkpt && isEnergyFlowTag(name)) {
                            inEnergyFlow = true;
                        }
                        break;
                    }
                    case XmlPullParser.TEXT: {
                        if (inEnergyFlow) {
                            try {
                                energyFlow = Integer.parseInt(parser.getText().trim());
                            } catch (Exception ignored) {
                            }
                        }
                        break;
                    }
                    case XmlPullParser.END_TAG: {
                        String name = parser.getName();
                        if (isEnergyFlowTag(name)) {
                            inEnergyFlow = false;
                        } else if ("trkpt".equals(name) && inTrkpt) {
                            points.add(new TripPoint(lat, lon, energyFlow));
                            inTrkpt = false;
                        }
                        break;
                    }
                    default:
                        break;
                }
                eventType = parser.next();
            }
        } catch (Exception ignored) {
            // File assente/corrotto: torniamo una lista vuota, la TripTraceView mostra
            // semplicemente "Nessuna traccia GPS salvata".
        }
        return points;
    }

    private static double parseOrZero(String s) {
        if (s == null) return 0;
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    // L'estensione e' scritta come <jd:energyFlow> (vedi TrackingService.buildGpx()):
    // confrontiamo anche solo il nome locale, in caso il parser non normalizzi il prefisso.
    private static boolean isEnergyFlowTag(String name) {
        return name != null && (name.equals("energyFlow") || name.endsWith(":energyFlow"));
    }
}
