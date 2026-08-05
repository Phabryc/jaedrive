package com.phabryc.jaedrive;

import android.util.Xml;

import org.xmlpull.v1.XmlPullParser;

import java.io.File;
import java.io.FileInputStream;
import java.time.Instant;
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
            boolean inBatteryPct = false;
            boolean inFuelPct = false;
            boolean inDriveMode = false;
            boolean inSpeedKmh = false;
            boolean inInstConsumption = false;
            boolean inRegenLevel = false;
            boolean inTime = false;
            boolean inPauseEndTime = false;
            double lat = 0, lon = 0;
            int energyFlow = -1;
            float batteryPct = -1f, fuelPct = -1f;
            int driveMode = -1, regenLevel = -1;
            float speedKmh = -1f, instConsumption = -1f;
            long timeMillis = 0;
            Long pauseEndMillis = null;

            while (eventType != XmlPullParser.END_DOCUMENT) {
                switch (eventType) {
                    case XmlPullParser.START_TAG: {
                        String name = parser.getName();
                        if ("trkpt".equals(name)) {
                            inTrkpt = true;
                            energyFlow = -1;
                            batteryPct = -1f;
                            fuelPct = -1f;
                            driveMode = -1;
                            regenLevel = -1;
                            speedKmh = -1f;
                            instConsumption = -1f;
                            timeMillis = 0;
                            pauseEndMillis = null;
                            lat = parseOrZero(parser.getAttributeValue(null, "lat"));
                            lon = parseOrZero(parser.getAttributeValue(null, "lon"));
                        } else if (inTrkpt && "time".equals(name)) {
                            inTime = true;
                        } else if (inTrkpt && isExtensionTag(name, "pauseEndTime")) {
                            inPauseEndTime = true;
                        } else if (inTrkpt && isExtensionTag(name, "energyFlow")) {
                            inEnergyFlow = true;
                        } else if (inTrkpt && isExtensionTag(name, "batteryPct")) {
                            inBatteryPct = true;
                        } else if (inTrkpt && isExtensionTag(name, "fuelPct")) {
                            inFuelPct = true;
                        } else if (inTrkpt && isExtensionTag(name, "driveMode")) {
                            inDriveMode = true;
                        } else if (inTrkpt && isExtensionTag(name, "speedKmh")) {
                            inSpeedKmh = true;
                        } else if (inTrkpt && isExtensionTag(name, "instConsumption")) {
                            inInstConsumption = true;
                        } else if (inTrkpt && isExtensionTag(name, "regenLevel")) {
                            inRegenLevel = true;
                        }
                        break;
                    }
                    case XmlPullParser.TEXT: {
                        if (inTime) {
                            try {
                                timeMillis = Instant.parse(parser.getText().trim()).toEpochMilli();
                            } catch (Exception ignored) {
                            }
                        } else if (inPauseEndTime) {
                            try {
                                pauseEndMillis = Instant.parse(parser.getText().trim()).toEpochMilli();
                            } catch (Exception ignored) {
                            }
                        } else if (inEnergyFlow) {
                            try {
                                energyFlow = Integer.parseInt(parser.getText().trim());
                            } catch (Exception ignored) {
                            }
                        } else if (inBatteryPct) {
                            try {
                                batteryPct = Float.parseFloat(parser.getText().trim());
                            } catch (Exception ignored) {
                            }
                        } else if (inFuelPct) {
                            try {
                                fuelPct = Float.parseFloat(parser.getText().trim());
                            } catch (Exception ignored) {
                            }
                        } else if (inDriveMode) {
                            try {
                                driveMode = Integer.parseInt(parser.getText().trim());
                            } catch (Exception ignored) {
                            }
                        } else if (inSpeedKmh) {
                            try {
                                speedKmh = Float.parseFloat(parser.getText().trim());
                            } catch (Exception ignored) {
                            }
                        } else if (inInstConsumption) {
                            try {
                                instConsumption = Float.parseFloat(parser.getText().trim());
                            } catch (Exception ignored) {
                            }
                        } else if (inRegenLevel) {
                            try {
                                regenLevel = Integer.parseInt(parser.getText().trim());
                            } catch (Exception ignored) {
                            }
                        }
                        break;
                    }
                    case XmlPullParser.END_TAG: {
                        String name = parser.getName();
                        if ("time".equals(name)) {
                            inTime = false;
                        } else if (isExtensionTag(name, "pauseEndTime")) {
                            inPauseEndTime = false;
                        } else if (isExtensionTag(name, "energyFlow")) {
                            inEnergyFlow = false;
                        } else if (isExtensionTag(name, "batteryPct")) {
                            inBatteryPct = false;
                        } else if (isExtensionTag(name, "fuelPct")) {
                            inFuelPct = false;
                        } else if (isExtensionTag(name, "driveMode")) {
                            inDriveMode = false;
                        } else if (isExtensionTag(name, "speedKmh")) {
                            inSpeedKmh = false;
                        } else if (isExtensionTag(name, "instConsumption")) {
                            inInstConsumption = false;
                        } else if (isExtensionTag(name, "regenLevel")) {
                            inRegenLevel = false;
                        } else if ("trkpt".equals(name) && inTrkpt) {
                            points.add(new TripPoint(lat, lon, energyFlow, batteryPct, fuelPct,
                                driveMode, speedKmh, instConsumption, regenLevel, timeMillis, pauseEndMillis));
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

    // Le estensioni sono scritte come <jd:energyFlow>/<jd:batteryPct>/<jd:fuelPct> (vedi
    // TrackingService.buildGpx()): confrontiamo anche solo il nome locale, in caso il
    // parser non normalizzi il prefisso.
    private static boolean isExtensionTag(String name, String localName) {
        return name != null && (name.equals(localName) || name.endsWith(":" + localName));
    }
}
