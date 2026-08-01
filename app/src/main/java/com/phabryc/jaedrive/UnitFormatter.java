package com.phabryc.jaedrive;

import android.content.Context;

import java.util.Locale;

// Formattazione numeri per la UI secondo le unita' scelte in Impostazioni. I dati
// restano SEMPRE salvati internamente in km/litri (TripRecord, TripConsumption,
// ManualTripComputer, GPX): la conversione avviene solo qui, al momento di mostrarli.
public class UnitFormatter {

    private static final double KM_TO_MI = 0.621371;
    private static final double L_PER_IMPERIAL_GALLON = 4.54609;

    public static String formatDistance(Context ctx, double km) {
        if (Prefs.isDistanceMiles(ctx)) {
            return String.format(Locale.ITALY, "%.1f mi", km * KM_TO_MI);
        }
        return String.format(Locale.ITALY, "%.1f km", km);
    }

    public static String formatLiters(Context ctx, double liters) {
        return String.format(Locale.ITALY, "%.2f L", liters);
    }

    // Velocita' istantanea (hero speedometer) - convertita anch'essa in mph con le miglia
    // (richiesta esplicita 2026-08-02), a differenza del consumo NON dipende dal formato
    // ratio/l100 (non ha senso una "velocita' per 100 unita' di qualcosa"). Il chiamante
    // (MainActivity, PERF_VEHICLE_SPEED) aggiorna anche il suffisso testuale a parte - vedi
    // R.id.tv_speed_unit - restando un TextView statico invece che parte di questa stringa,
    // dato che qui il valore va formattato senza decimali ad ogni tick (property CONTINUOUS).
    public static float toDisplaySpeedKmh(Context ctx, float speedKmh) {
        return Prefs.isDistanceMiles(ctx) ? (float) (speedKmh * KM_TO_MI) : speedKmh;
    }

    // Formato consumo scelto in Impostazioni - due assi indipendenti: km/mi (stesso toggle
    // usato per formatDistance) e "percorrenza per unita' di carburante" vs "carburante per
    // 100 unita' di distanza". L'unita' di CARBURANTE segue la distanza in entrambi i formati
    // (mercato UK, richiesta esplicita 2026-08-02): litri se km (km/l, L/100km), GALLONE
    // IMPERIALE (non USA) se miglia (mpg, gal/100mi) - "(UK)" nell'etichetta per non lasciare
    // ambiguita' su quale gallone, dato che "mpg"/"gal" da soli si confondono facilmente con
    // la variante USA (3.785 L, contro i 4.546 L di quello imperiale usato qui).
    // kmPerLiter e' sempre > 0 quando questo metodo viene chiamato: i chiamanti
    // (MainActivity) passano avg solo quando TripConsumption.computeAverage() l'ha calcolato
    // con successo (litri > 0), mai un valore nullo/zero/infinito.
    public static String formatConsumption(Context ctx, double kmPerLiter) {
        boolean miles = Prefs.isDistanceMiles(ctx);
        if (Prefs.isConsumptionL100km(ctx)) {
            double perHundredKm = 100.0 / kmPerLiter;
            if (miles) {
                double galPer100Mi = perHundredKm / (KM_TO_MI * L_PER_IMPERIAL_GALLON);
                return String.format(Locale.ITALY, "%.1f gal/100mi (UK)", galPer100Mi);
            }
            return String.format(Locale.ITALY, "%.1f L/100km", perHundredKm);
        }
        if (miles) {
            double mpg = kmPerLiter * KM_TO_MI * L_PER_IMPERIAL_GALLON;
            return String.format(Locale.ITALY, "%.1f mpg (UK)", mpg);
        }
        return String.format(Locale.ITALY, "%.2f km/l", kmPerLiter);
    }
}
