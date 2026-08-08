package com.phabryc.jaedriveprobe;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Copia identica di app/src/main/java/com/phabryc/jaedrive/VehicleCatalog.java (richiesta
// esplicita utente 2026-08-08): il probe deve offrire all'operatore lo STESSO catalogo
// marca/modello/motorizzazione dell'app principale, cosi' la risposta si confronta 1:1 coi
// byte marca/piattaforma/motorizzazione rilevati via VDB in dumpVehicleConfig() - testo libero
// avrebbe reso il confronto ambiguo. Moduli Gradle separati (probe/ non dipende da app/), da
// cui la copia invece di un riferimento diretto - stesso pattern gia' usato per VDEvent.java/
// l'AIDL di IVDBus quando il modulo probe e' stato creato.
public class VehicleCatalog {

    public static final String BRAND_JAECOO = "JAECOO";
    public static final String BRAND_OMODA = "OMODA";
    public static final String[] BRANDS = {BRAND_JAECOO, BRAND_OMODA};

    public static final String PT_ICE_2WD = "ICE_2WD";
    public static final String PT_ICE_4WD = "ICE_4WD";
    public static final String PT_SHS_H = "SHS_H";
    public static final String PT_SHS_P = "SHS_P";
    public static final String PT_SHS_P_4WD = "SHS_P_4WD";
    public static final String PT_BEV = "BEV";

    public static String powertrainLabel(String key) {
        if (key == null) return "";
        switch (key) {
            case PT_ICE_2WD: return "ICE 2WD";
            case PT_ICE_4WD: return "ICE 4WD";
            case PT_SHS_H: return "SHS-H";
            case PT_SHS_P: return "SHS-P";
            case PT_SHS_P_4WD: return "SHS-P 4WD";
            case PT_BEV: return "BEV";
            default: return key;
        }
    }

    private static final Map<String, String[]> MODELS_BY_BRAND = new LinkedHashMap<>();
    private static final Map<String, String[]> POWERTRAINS_BY_BRAND_MODEL = new LinkedHashMap<>();

    static {
        MODELS_BY_BRAND.put(BRAND_JAECOO, new String[]{"5", "7", "8"});
        MODELS_BY_BRAND.put(BRAND_OMODA, new String[]{"5", "7", "9"});

        POWERTRAINS_BY_BRAND_MODEL.put(key(BRAND_JAECOO, "5"), new String[]{PT_ICE_2WD, PT_SHS_H, PT_BEV});
        POWERTRAINS_BY_BRAND_MODEL.put(key(BRAND_JAECOO, "7"), new String[]{PT_ICE_2WD, PT_ICE_4WD, PT_SHS_H, PT_SHS_P});
        POWERTRAINS_BY_BRAND_MODEL.put(key(BRAND_JAECOO, "8"), new String[]{PT_ICE_2WD, PT_ICE_4WD, PT_SHS_P_4WD});
        POWERTRAINS_BY_BRAND_MODEL.put(key(BRAND_OMODA, "5"), new String[]{PT_ICE_2WD, PT_ICE_4WD, PT_SHS_H, PT_BEV});
        POWERTRAINS_BY_BRAND_MODEL.put(key(BRAND_OMODA, "7"), new String[]{PT_ICE_2WD, PT_ICE_4WD, PT_SHS_P});
        POWERTRAINS_BY_BRAND_MODEL.put(key(BRAND_OMODA, "9"), new String[]{PT_ICE_2WD, PT_ICE_4WD, PT_SHS_P_4WD});
    }

    private static String key(String brand, String model) {
        return brand + "|" + model;
    }

    public static String[] modelsFor(String brand) {
        String[] models = MODELS_BY_BRAND.get(brand);
        return models != null ? models : new String[0];
    }

    // A differenza di app/ (che espone powertrainsForOnboarding() senza BEV, perche' la sua UI
    // energia non supporta ancora le elettriche pure), il probe mostra la lista COMPLETA
    // (incluso BEV): qui l'obiettivo e' solo mappare la risposta dell'operatore contro il
    // catalogo, non decidere quali card mostrare in un'app - nascondere BEV toglierebbe
    // proprio le combinazioni (Jaecoo 5 BEV, Omoda 5 BEV) piu' utili da correlare con un
    // getConfig() powertrain byte == 2 (EV).
    public static String[] powertrainsFor(String brand, String model) {
        String[] pts = POWERTRAINS_BY_BRAND_MODEL.get(key(brand, model));
        return pts != null ? pts : new String[0];
    }

    public static String displayName(String brand, String model, String powertrain) {
        StringBuilder sb = new StringBuilder();
        if (brand != null) sb.append(brand);
        if (model != null) sb.append(" ").append(model);
        if (powertrain != null) sb.append(" ").append(powertrainLabel(powertrain));
        return sb.toString().trim();
    }
}
