package com.phabryc.jaedrive;

// Interpretazione del valore ENERGY_FLOW (VDInfoClient.ID_ENERGY_FLOW).
//
// CORREZIONE (2026-07-23): la prima decodifica (fatta leggendo initAnimation(I) in
// NewEnergyFragment.smali, SVSetting_dec) usava per errore la tabella "four_wheel_"
// (ramo mIs4Wd) invece di quella "two_wheel_" (ramo mIs2Wd) - la Jaecoo 7 SHS-H e' a
// trazione 2WD, quindi e' la tabella giusta da usare per questa auto. Le due tabelle
// NON sono un semplice rename con lo stesso ordine numerico (es. "parallelo" e'
// value=9 nella tabella 4WD ma value=8 in quella 2WD), quindi usare quella sbagliata
// dava letture plausibili-ma-errate per quasi tutti gli stati tranne la rigenerazione.
// Tabella "two_wheel_" ricostruita dal packed-switch (:pswitch_data_1) e dai nomi
// risorsa in com/desaysv/setting/R$drawable.smali, poi raggruppata dall'utente in 5
// macro-categorie (tabella riepilogativa concordata 2026-07-23):
//   1  -> two_wheel_charge_0                (statico, frame 0 fermo)         => IDLE (vedi nota sotto)
//   2  -> two_wheel_electric_               (elettrico puro)                 => EV  [CONFERMATO SUL CAMPO]
//   3  -> two_wheel_flow_off                (nessun flusso)                  => IDLE
//   4  -> two_wheel_extend_range_discharge_ (range-extender, assiste)        => HEV SERIE
//   5  -> two_wheel_extend_range_charge_    (range-extender, ricarica)       => HEV SERIE
//   6,7,9,14 -> two_wheel_flow_off          (nessun flusso)                  => IDLE
//   8  -> two_wheel_parallel_               (motore+elettrico insieme)       => HEV PARALLELO
//   10 -> two_wheel_engine_power_           (motore da solo)                 => HEV PARALLELO (parallelo con contributo elettrico zero, non un'architettura a se')
//   11 -> two_wheel_running_generate_       (motore genera in movimento)     => HEV SERIE (auto in moto, il termico genera senza spingere le ruote - stesso comportamento di 4/5, non e' "solo ricarica")
//   12 -> two_wheel_parking_generate_       (motore ricarica da fermo)       => CHR
//   13 -> two_wheel_regenerate_brake_       (rigenerazione in frenata)       => CHR
//   15 -> two_wheel_charge_                 (carica generica)                => CHR
//   16 -> two_wheel_decelerating_charge_    (rigenerazione leggera in rilascio) => CHR
// Nessuno stato di retromarcia in questa tabella (quelli documentati in precedenza
// appartenevano alla tabella 4WD sbagliata, non esistono in quella 2WD).
//
// CORREZIONE (2026-07-23, stesso giorno): il valore 1 era stato messo in CHR per il nome
// della risorsa ("charge_0"), ma era gia' segnato come ipotesi senza prova diretta.
// Utente ha riportato in auto che appena il powertrain va "ready" (motore termico
// spento, auto ferma, nessuna ricarica reale in corso) la dashboard mostra CHARGE.
// Rianalizzando lo smali di initAnimation(): il case per value=1 (:pswitch_1b) NON
// costruisce dinamicamente un nome di risorsa da un prefisso + indice di frame (come
// fanno invece i veri stati di flusso, es. 12/13/15/16, che vanno a :goto_2 e animano una
// sequenza two_wheel_charge_0.._49), ma imposta DIRETTAMENTE e staticamente il singolo
// frame "two_wheel_charge_0" (fermo, nessuna animazione) - esattamente la stessa
// struttura di codice del case "nessun flusso" (:pswitch_10, valori 3/6/7/9/14, che
// imposta staticamente "two_wheel_flow_off"). Quindi value=1 e' un placeholder
// statico/transitorio (verosimilmente emesso subito dopo l'accensione, prima che il bus
// stabilizzi un vero stato), non una vera ricarica - spostato da CHR a IDLE.
import java.util.List;

public class EnergyFlowUtil {

    public enum Bucket {
        EV,       // 2: elettrico puro
        SERIES,   // 4,5,11: HEV in serie (range-extender, motore non collegato alle ruote)
        PARALLEL, // 8,10: HEV in parallelo (motore+elettrico insieme, o motore da solo)
        CHR,      // 12,13,15,16: ricarica/rigenerazione
        IDLE      // 1,3,6,7,9,14: nessun flusso (1 = frame statico "charge_0", non una vera ricarica)
    }

    public static Bucket bucketFor(int value) {
        switch (value) {
            case 2: return Bucket.EV;
            case 4:
            case 5:
            case 11: return Bucket.SERIES;
            case 8:
            case 10: return Bucket.PARALLEL;
            case 12:
            case 13:
            case 15:
            case 16: return Bucket.CHR;
            default: return Bucket.IDLE;
        }
    }

    // Colori per traccia GPS (mappa/fallback offline) e badge "flusso energia" nella
    // dashboard, schema esplicito richiesto dall'utente: EV=blu, HEV serie=giallo,
    // HEV parallelo=arancione, CHR=verde, IDLE=grigio.
    public static int colorFor(int value) {
        return colorForBucket(bucketFor(value));
    }

    public static int colorForBucket(Bucket bucket) {
        switch (bucket) {
            case EV: return 0xFF00BFFF;
            case SERIES: return 0xFFFFC107;
            case PARALLEL: return 0xFFF57C00;
            case CHR: return 0xFF2E7D32;
            default: return 0xFF4A4A4A;
        }
    }

    // Percentuali EV/serie/parallelo per il payload di upload cloud (vedi CloudApiClient) -
    // stesso conteggio di MainActivity.updateEnergyFlowBreakdown() ma con CHR+IDLE
    // accorpati in un unico "pctOther", perche' lo schema cloud (vedi cloud/DESIGN.md §10)
    // ha solo quattro categorie, non le cinque della UI Storico. Ritorna null se non c'e'
    // nessun campione ENERGY_FLOW valido (es. trip manuale, senza traccia GPX).
    public static double[] computeUploadBreakdown(List<TripPoint> points) {
        int ev = 0, series = 0, parallel = 0, other = 0, known = 0;
        for (TripPoint p : points) {
            if (p.energyFlow < 0) continue;
            known++;
            switch (bucketFor(p.energyFlow)) {
                case EV: ev++; break;
                case SERIES: series++; break;
                case PARALLEL: parallel++; break;
                default: other++; break;
            }
        }
        if (known == 0) return null;
        return new double[]{100.0 * ev / known, 100.0 * series / known, 100.0 * parallel / known, 100.0 * other / known};
    }
}
