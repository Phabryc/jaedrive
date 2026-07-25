package com.phabryc.jaedrive;

import android.content.Context;

import java.util.Locale;

// Formattazione numeri per la UI secondo le unita' scelte in Impostazioni. I dati
// restano SEMPRE salvati internamente in km/litri (TripRecord, TripConsumption,
// ManualTripComputer, GPX): la conversione avviene solo qui, al momento di mostrarli.
public class UnitFormatter {

    private static final double KM_TO_MI = 0.621371;
    private static final double L_TO_GAL = 0.264172;

    public static String formatDistance(Context ctx, double km) {
        if (Prefs.isDistanceMiles(ctx)) {
            return String.format(Locale.ITALY, "%.1f mi", km * KM_TO_MI);
        }
        return String.format(Locale.ITALY, "%.1f km", km);
    }

public static String formatLiters(Context ctx, double liters) {
        if (Prefs.isConsumptionGallons(ctx)) {
            return String.format(Locale.ITALY, "%.2f gal", liters * L_TO_GAL);
        }
        return String.format(Locale.ITALY, "%.2f L", liters);
    }

    // Il consumo resta espresso come "percorrenza per unita' di carburante"
    // (km/l oppure mi/gal), coerente con l'unita' scelta per distanza/carburante.
    public static String formatConsumption(Context ctx, double kmPerLiter) {
        boolean miles = Prefs.isDistanceMiles(ctx);
        boolean gallons = Prefs.isConsumptionGallons(ctx);
        double value = kmPerLiter;
        if (miles) value *= KM_TO_MI;
        if (gallons) value /= L_TO_GAL;
        String unit = (miles ? "mi" : "km") + "/" + (gallons ? "gal" : "l");
        return String.format(Locale.ITALY, "%.2f %s", value, unit);
    }
}
