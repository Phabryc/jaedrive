package com.phabryc.jaedrive;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Catalogo marca/modello/motorizzazione per l'onboarding obbligatorio (vedi
// MainActivity.showVehicleOnboardingDialog()) - dati forniti direttamente dall'utente
// (2026-07-25), non derivati da alcun segnale VDB. Sostituisce il precedente tentativo di
// rilevazione automatica (DiagnosisID.ID_MODEL_CODE/ID_BRAND), ritirato perche' senza
// caller di riferimento e quindi mai affidabile - vedi VDInfoClient.
public class VehicleCatalog {

    public static final String BRAND_JAECOO = "JAECOO";
    public static final String BRAND_OMODA = "OMODA";
    public static final String[] BRANDS = {BRAND_JAECOO, BRAND_OMODA};

    // Chiavi stabili (salvate/inviate al cloud) - la label mostrata all'utente e' separata
    // (vedi powertrainLabel()) cosi' un domani si puo' tradurre/rinominare senza toccare i
    // dati gia' salvati su device/server.
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

    // Gamma comunicata dall'utente (2026-07-25): non e' la stessa lista di motorizzazioni
    // per ogni modello (a differenza di un'ipotesi iniziale di gamma condivisa nel gruppo
    // Chery, poi smentita) - ogni combinazione marca/modello ha la sua.
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

    public static String[] powertrainsFor(String brand, String model) {
        String[] pts = POWERTRAINS_BY_BRAND_MODEL.get(key(brand, model));
        return pts != null ? pts : new String[0];
    }

    // Come powertrainsFor(), ma senza BEV: non ancora selezionabile in onboarding (nessun
    // supporto dati implementato per le elettriche pure - vedi EnergyCapability), tenuto
    // pero' nel catalogo/nei dati sopra perche' la gamma reale la include comunque.
    public static String[] powertrainsForOnboarding(String brand, String model) {
        String[] all = powertrainsFor(brand, model);
        List<String> filtered = new ArrayList<>();
        for (String pt : all) {
            if (!PT_BEV.equals(pt)) filtered.add(pt);
        }
        return filtered.toArray(new String[0]);
    }

    public static String displayName(String brand, String model, String powertrain) {
        StringBuilder sb = new StringBuilder();
        if (brand != null) sb.append(brand);
        if (model != null) sb.append(" ").append(model);
        if (powertrain != null) sb.append(" ").append(powertrainLabel(powertrain));
        return sb.toString().trim();
    }

    // Categorizzazione usata per decidere quali segnali VDB pollare/quali card mostrare
    // (app) e quali sezioni mostrare (web) - vedi jaedrive_project memory per la tabella
    // completa dati/motorizzazione. H = ibrido non ricaricabile da rete, P = plug-in hybrid
    // (assunzione confermata dall'utente, 2026-07-26).
    public enum EnergyCapability {
        ICE,    // nessuna batteria di trazione: niente SOC/energy-flow/regen/autonomia elettrica
        HYBRID, // SHS_H/SHS_P/SHS_P_4WD: tutto quello gia' costruito per l'auto dell'utente
        BEV,    // batteria pura, nessun carburante - tenuto qui ma non ancora selezionabile
    }

    public static EnergyCapability capabilityFor(String powertrain) {
        if (powertrain == null) return null;
        switch (powertrain) {
            case PT_ICE_2WD:
            case PT_ICE_4WD:
                return EnergyCapability.ICE;
            case PT_BEV:
                return EnergyCapability.BEV;
            default: // PT_SHS_H, PT_SHS_P, PT_SHS_P_4WD
                return EnergyCapability.HYBRID;
        }
    }

    // Batteria ricaricabile da rete (non solo da rigenerazione/motore) - oggi non usato per
    // mostrare/nascondere nulla (il consumo elettrico non e' stato trovato come segnale
    // diretto su NewEnergyID, vedi VDInfoClient), tenuto pronto per quando lo sara'.
    public static boolean isPluggable(String powertrain) {
        return PT_SHS_P.equals(powertrain) || PT_SHS_P_4WD.equals(powertrain) || PT_BEV.equals(powertrain);
    }
}
