package com.phabryc.jaedriveprobe;

import android.app.Activity;
import android.app.AlertDialog;
import android.car.Car;
import android.car.VehiclePropertyIds;
import android.car.hardware.CarPropertyConfig;
import android.car.hardware.CarPropertyValue;
import android.car.hardware.property.CarPropertyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.format.DateFormat;
import android.util.DisplayMetrics;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.desaysv.ivi.vdb.IVDBus;
import com.desaysv.ivi.vdb.event.VDEvent;

import net.lingala.zip4j.ZipFile;
import net.lingala.zip4j.model.ZipParameters;
import net.lingala.zip4j.model.enums.AesKeyStrength;
import net.lingala.zip4j.model.enums.EncryptionMethod;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.zip.CRC32;

// JaeDriveProbe (2026-08-05, richiesta esplicita utente): strumento diagnostico
// standalone, indipendente da JaeDrive - pensato per essere installato su vetture
// Chery/Jaecoo/Omoda DIVERSE dalla propria (altri proprietari, un dealer) per raccogliere
// in un colpo solo tutte le informazioni utili a capire se le tabelle di JaeDrive
// (flusso energia, drive mode, formule di decodifica VDB) valgono anche per quel
// modello/motorizzazione/trim, senza bisogno di adb/USB debugging sull'altra vettura -
// solo installare l'APK e premere un pulsante. Nessun account, nessuna connessione
// internet, nessun dato inviato da nessuna parte: tutto resta in uno zip esportato su USB.
// Testo utente in inglese (richiesta esplicita utente 2026-08-05): questo strumento puo'
// finire su vetture di sconosciuti in mano a chiunque, l'inglese e' piu' universale
// dell'italiano usato nel resto del progetto.
public class MainActivity extends Activity {

    private TextView tvLog;
    private TextView tvStatus;
    private Button btnStart;
    private Button btnRetryCopy;
    private CheckBox cbSystemFiles;
    private final StringBuilder fullLog = new StringBuilder();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private Car mCar;
    private CarPropertyManager mCarPropertyManager;
    private IVDBus vdBus;

    private static final String CARINFO_PKG = "com.desaysv.ivi.vds.carinfo";
    private static final String CARINFO_ACTION = "action.desaysv.ivi.vds.carinfo.SERVICE";

    // Moduli VDB gia' noti dal reverse engineering di JaeDrive (vedi VDInfoClient.java nel
    // modulo app/) - CAR_SETTING e CAR_COMPUTER non sono mai stati sondati li', inclusi qui
    // apposta per completezza dato che questo e' uno strumento esplorativo.
    private static final int MODULE_CAR_SETTING = 0x50001;
    private static final int MODULE_NEW_ENERGY = 0x50002;
    private static final int MODULE_READONLY_INFO = 0x50004;
    private static final int MODULE_DOANOSE = 0x50007;
    private static final int MODULE_CAR_COMPUTER = 0x50015;
    // MODULE_HVAC (2026-08-07, indagine climatizzazione remota in sosta): mai sondato prima,
    // scoperto decompilando le app di sistema Desay (com.desaysv.ivi.vdb.event.id.carinfo.
    // VDEventCarInfo.MODULE_HVAC). E' il modulo dove vivono ID_PARKING_AC_REQ/DISP/LIGHT_SWITCH
    // (0xe/0xf/0xb, classe com.desaysv.ivi.extra.project.carinfo.HvacID) - lo scopo e' vedere
    // se questi cmdId rispondono con un valore reale su questa vettura (VDBus.get() non
    // scriverebbe comunque nulla, e' sempre e solo una lettura, coerente con lo scopo
    // diagnostico/non invasivo dello strumento).
    private static final int MODULE_HVAC = 0x5000a;
    private static final int[] MODULES_TO_SWEEP = {
        MODULE_CAR_SETTING, MODULE_NEW_ENERGY, MODULE_READONLY_INFO, MODULE_DOANOSE, MODULE_CAR_COMPUTER,
        MODULE_HVAC
    };
    private static final int MAX_CMD_ID = 0xFF;

    // Config veicolo bit-packed (2026-08-08, seguito indagine marca/modello/motorizzazione):
    // modulo diverso da quelli sopra (0xE0006, non 0x5xxxx) e servito da un service Android
    // completamente diverso da CARINFO - il VDRouter di SVSetting.apk sceglie il connector
    // in base ai 16 bit alti del modulo (0xE0006 >> 16 = 0xE = VEHICLE_DEVICE nel suo enum
    // ServiceType, decompilato da VDServiceDef.smali). L'azione di binding di questo service e'
    // vuota nell'OEM (bind per nome componente esplicito, non per action string), da cui
    // l'Intent.setClassName() sotto invece del pattern Intent(action).setPackage() usato per
    // CARINFO_ACTION. getOnce() del client OEM (VDBus/VDRouter/VDConnector) e' stato verificato
    // nello smali risolversi nella stessa identica transazione Binder IVDBus.get() gia'
    // implementata nell'AIDL qui sotto - nessun metodo nuovo da aggiungere all'interfaccia.
    private static final String VDEV_PKG = "com.desaysv.ivi.vds.vdev";
    private static final String VDEV_SERVICE_CLASS = "com.desaysv.ivi.vds.vdev.service.VehicleDevice";
    private static final int MODULE_PROJECT_CONFIG = 0xE0006;

    // TBox (2026-08-07, stessa indagine): il modulo telematico si integra con le app
    // dell'head unit tramite un ContentProvider Android (com.desaysv.ivi.extra.vdb.event.id.
    // carlan.VDExValueCarLan$TBoxRequest/TBoxResponse, fornitore Neusoft), non il bus VDB.
    // Qui si interrogano SOLO le URI di sola lettura/stato (mai "Request" che sono in realta'
    // comandi attuatori, es. CallRequest compone davvero una chiamata, PowerDownHVRequest
    // agisce sulla batteria alta tensione - queste non vanno mai eseguite da uno strumento
    // diagnostico passivo, tantomeno su un'auto che potrebbe non essere la propria).
    private static final String TBOX_AUTHORITY = "tbox.automotive.neusoft.com";
    private static final String[] TBOX_STATUS_QUERIES = {
        "TSPConnectionStateRequest", // stato connessione con il Telematics Service Provider (dati/cloud)
        "SIMCardInfoRequest",
        "NetworkStatusRequest",
        "TBoxVersionRequest",
        "VINRequest",
        "KL15StateRequest",
        "CellInfoRequest",
        "IMEIInfoRequest",
    };

    // Password dell'archivio finale, tenuta fuori dalla vista come stringa letterale (richiesta
    // esplicita utente: offuscare l'apk) - una String costante finirebbe comunque in chiaro nel
    // pool costanti del dex ed e' banalmente estraibile con `strings`/jadx anche con R8 attivo
    // (R8 non tocca le stringhe letterali). Qui e' ricostruita a runtime da byte con XOR, cosa
    // che alza la soglia oltre un semplice grep testuale senza pretendere di essere crittografia
    // vera. Nessun riferimento alla password (ne' al fatto che l'export sia protetto) deve
    // comparire nel log visibile all'utente - vedi runFullScan().
    private static final int[] ZIP_PW_OBFUSCATED = {
        0x10, 0x3B, 0x3F, 0x0A, 0x28, 0x35, 0x38, 0x3F, 0x68, 0x6A, 0x68, 0x6C, 0x7B
    };
    private static final int ZIP_PW_XOR_KEY = 0x5A;

    // Set minimo di APK necessarie a decodificare i segnali VDB gia' gestiti in JaeDrive
    // (vedi VDInfoClient.java in app/): SVSetting.apk e' il dispatcher confermato per quasi
    // tutte le formule (ID_TRIP, ID_ENDURANCE_KM/TOTAL_RANGE, ID_ENERGY_RECYCLE_LEVEL,
    // ID_TIRE_PRESSURE_WARNING, SUM_FUEL, ecc.), SVVDSCarInfo.apk espone il dispatcher di
    // protocollo/moduli del bus (com/desaysv/ivi/vds/carinfo/a/a.smali), CarLan/CarState/
    // EngMode sono gli altri tre gia' decompilati durante le indagini TBox/HVAC/VIN. Usato
    // quando la checkbox "System files" e' disattivata - un dump molto piu' leggero/veloce
    // su un'auto sconosciuta, quando serve solo verificare se queste formule valgono anche li'.
    private static final String[] MINIMAL_APK_PACKAGES = {
        "com.desaysv.setting",
        "com.desaysv.ivi.vds.carinfo",
        "com.desaysv.ivi.vds.carlan",
        "com.desaysv.ivi.vds.carstate",
        "com.desaysv.engmode",
    };

    private static char[] getZipPassword() {
        char[] pw = new char[ZIP_PW_OBFUSCATED.length];
        for (int i = 0; i < ZIP_PW_OBFUSCATED.length; i++) {
            pw[i] = (char) (ZIP_PW_OBFUSCATED[i] ^ ZIP_PW_XOR_KEY);
        }
        return pw;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        tvLog = findViewById(R.id.tv_log);
        tvStatus = findViewById(R.id.tv_status);
        btnStart = findViewById(R.id.btn_start_scan);
        btnRetryCopy = findViewById(R.id.btn_retry_copy);
        cbSystemFiles = findViewById(R.id.cb_system_files);
        btnStart.setOnClickListener(v -> {
            btnStart.setEnabled(false);
            btnRetryCopy.setEnabled(false);
            boolean systemFilesFull = cbSystemFiles.isChecked();
            showVehicleInfoDialog(operatorVehicleInfo -> {
                fullLog.setLength(0);
                tvLog.setText("");
                new Thread(() -> runFullScan(systemFilesFull, operatorVehicleInfo), "ProbeScan").start();
            });
        });
        btnRetryCopy.setOnClickListener(v -> {
            btnStart.setEnabled(false);
            btnRetryCopy.setEnabled(false);
            fullLog.setLength(0);
            tvLog.setText("");
            new Thread(this::retryPendingCopy, "ProbeRetryCopy").start();
        });
        checkForPendingInternalZip();
    }

    // ------------------------------------------------------------------
    // Recupero: se una scansione precedente ha costruito l'archivio ma la copia su USB e'
    // stata interrotta (vedi copyToUsbVerified()), lo zip resta nella memoria interna
    // dell'app - richiesta esplicita utente (2026-08-08, dopo aver trovato sul campo un
    // archivio su USB troncato/corrotto): invece di dover rifare l'intera scansione, offrire
    // di ricopiarlo cosi' com'e'.
    // ------------------------------------------------------------------
    private void checkForPendingInternalZip() {
        File pending = findPendingInternalZip();
        mainHandler.post(() -> {
            if (pending != null) {
                btnRetryCopy.setVisibility(View.VISIBLE);
                btnRetryCopy.setEnabled(true);
                btnRetryCopy.setText("RETRY USB COPY (" + pending.getName() + ")");
            } else {
                btnRetryCopy.setVisibility(View.GONE);
            }
        });
    }

    private File findPendingInternalZip() {
        File[] files = getFilesDir().listFiles((dir, name) -> name.startsWith("JaeDriveProbe_") && name.endsWith(".zip"));
        if (files == null || files.length == 0) return null;
        File newest = files[0];
        for (File f : files) {
            if (f.lastModified() > newest.lastModified()) newest = f;
        }
        return newest;
    }

    private void retryPendingCopy() {
        log("========================================");
        log("Retrying USB copy of a previously built archive");
        log("========================================");
        File pending = findPendingInternalZip();
        if (pending == null) {
            log("No pending archive found in internal storage.");
            status("Nothing to retry");
            mainHandler.post(() -> {
                btnStart.setEnabled(true);
                checkForPendingInternalZip();
            });
            return;
        }
        log("Found: " + pending.getName() + " (" + (pending.length() / 1024 / 1024) + " MB)");
        status("Copying to USB...");
        boolean copiedToUsb = copyToUsbVerified(pending);
        if (copiedToUsb) {
            boolean deleted = pending.delete();
            log(deleted ? "Copy verified OK, internal copy removed."
                : "Copy verified OK, but could not remove internal copy: " + pending.getName());
        } else {
            log("Copy failed or could not be verified - internal copy KEPT, try again.");
        }
        status(copiedToUsb ? "Done - copied to USB and verified" : "Copy failed - internal copy kept, retry when ready");
        mainHandler.post(() -> {
            btnStart.setEnabled(true);
            checkForPendingInternalZip();
        });
    }

    private void log(String line) {
        String stamped = DateFormat.format("HH:mm:ss", System.currentTimeMillis()) + "  " + line + "\n";
        fullLog.append(stamped);
        mainHandler.post(() -> tvLog.append(stamped));
    }

    private void status(String s) {
        mainHandler.post(() -> tvStatus.setText(s));
    }

    // ------------------------------------------------------------------
    // 0. Onboarding operatore (2026-08-08, richiesta esplicita utente): STESSO dialog marca/
    // modello/motorizzazione dell'app principale (chip a cascata, stesso VehicleCatalog, stesso
    // stile grafico - vedi dialog_vehicle_onboarding.xml, copiato da app/ insieme ai drawable/
    // colori che referenzia), non testo libero: solo cosi' la risposta si confronta 1:1 coi
    // byte marca/piattaforma/motorizzazione/trazione rilevati via VDB in dumpVehicleConfig() -
    // esattamente il dato empirico che manca per costruire il dizionario "codice piattaforma
    // interno -> nome commerciale" (l'OEM stesso non lo conosce, solo codename tipo T1EJ). A
    // differenza dell'app, qui il pulsante "SKIP" e' sempre visibile (mai obbligatorio: questo
    // strumento gira anche su auto/marche fuori dal catalogo JAECOO/OMODA note a JaeDrive) e non
    // c'e' alcuna sezione VIN (nessun pairing/cloud nel probe).
    // ------------------------------------------------------------------
    private interface VehicleInfoCallback {
        void onReady(String operatorVehicleInfo);
    }

    private void showVehicleInfoDialog(VehicleInfoCallback callback) {
        View root = getLayoutInflater().inflate(R.layout.dialog_vehicle_onboarding, null);
        LinearLayout brandContainer = root.findViewById(R.id.vehicle_brand_container);
        TextView modelLabel = root.findViewById(R.id.tv_vehicle_model_label);
        LinearLayout modelContainer = root.findViewById(R.id.vehicle_model_container);
        TextView powertrainLabel = root.findViewById(R.id.tv_vehicle_powertrain_label);
        LinearLayout powertrainContainer = root.findViewById(R.id.vehicle_powertrain_container);
        TextView btnSkip = root.findViewById(R.id.btn_vehicle_onboarding_close);
        TextView btnConfirm = root.findViewById(R.id.btn_vehicle_onboarding_confirm);

        // Stato mutabile catturato dalle lambda sotto (array di 1 elemento, stesso pattern di
        // MainActivity.showVehicleOnboardingDialog() nell'app - le variabili locali in Java
        // devono essere effectively final per essere catturate da una lambda).
        String[] selected = {null, null, null};

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setView(root)
            .setCancelable(false)
            .create();
        if (dialog.getWindow() != null) dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);

        btnSkip.setOnClickListener(v -> {
            dialog.dismiss();
            callback.onReady("(not provided by operator)");
        });

        Runnable updateConfirmState = () -> btnConfirm.setAlpha(
            (selected[0] != null && selected[1] != null && selected[2] != null) ? 1f : 0.4f);

        Runnable[] populatePowertrain = new Runnable[1];
        Runnable[] populateModel = new Runnable[1];
        Runnable[] populateBrand = new Runnable[1];

        populatePowertrain[0] = () -> {
            powertrainContainer.removeAllViews();
            if (selected[0] == null || selected[1] == null) {
                powertrainLabel.setVisibility(View.GONE);
                powertrainContainer.setVisibility(View.GONE);
                return;
            }
            powertrainLabel.setVisibility(View.VISIBLE);
            powertrainContainer.setVisibility(View.VISIBLE);
            for (String pt : VehicleCatalog.powertrainsFor(selected[0], selected[1])) {
                TextView chip = buildOnboardingChip(VehicleCatalog.powertrainLabel(pt), pt.equals(selected[2]));
                chip.setOnClickListener(v -> {
                    selected[2] = pt;
                    populatePowertrain[0].run();
                    updateConfirmState.run();
                });
                addWeightedChip(powertrainContainer, chip);
            }
        };

        populateModel[0] = () -> {
            modelContainer.removeAllViews();
            if (selected[0] == null) {
                modelLabel.setVisibility(View.GONE);
                modelContainer.setVisibility(View.GONE);
                return;
            }
            modelLabel.setVisibility(View.VISIBLE);
            modelContainer.setVisibility(View.VISIBLE);
            for (String model : VehicleCatalog.modelsFor(selected[0])) {
                TextView chip = buildOnboardingChip(selected[0] + " " + model, model.equals(selected[1]));
                chip.setOnClickListener(v -> {
                    if (!model.equals(selected[1])) {
                        selected[1] = model;
                        selected[2] = null;
                    }
                    populateModel[0].run();
                    populatePowertrain[0].run();
                    updateConfirmState.run();
                });
                addWeightedChip(modelContainer, chip);
            }
        };

        populateBrand[0] = () -> {
            brandContainer.removeAllViews();
            for (String brand : VehicleCatalog.BRANDS) {
                TextView chip = buildOnboardingChip(brand, brand.equals(selected[0]));
                chip.setOnClickListener(v -> {
                    if (!brand.equals(selected[0])) {
                        selected[0] = brand;
                        selected[1] = null;
                        selected[2] = null;
                    }
                    populateBrand[0].run();
                    populateModel[0].run();
                    populatePowertrain[0].run();
                    updateConfirmState.run();
                });
                addWeightedChip(brandContainer, chip);
            }
        };

        populateBrand[0].run();
        populateModel[0].run();
        populatePowertrain[0].run();
        updateConfirmState.run();

        btnConfirm.setOnClickListener(v -> {
            if (selected[0] == null || selected[1] == null || selected[2] == null) return;
            dialog.dismiss();
            callback.onReady(VehicleCatalog.displayName(selected[0], selected[1], selected[2]));
        });

        dialog.show();
    }

    // Chip di selezione singola - copiati identici da MainActivity.buildOnboardingChip()/
    // styleOnboardingChip()/addWeightedChip()/dp() dell'app principale.
    private TextView buildOnboardingChip(String text, boolean selected) {
        TextView chip = new TextView(this);
        chip.setText(text);
        chip.setTextSize(15);
        chip.setGravity(android.view.Gravity.CENTER);
        chip.setClickable(true);
        chip.setFocusable(true);
        styleOnboardingChip(chip, selected);
        return chip;
    }

    private void styleOnboardingChip(TextView chip, boolean selected) {
        if (selected) {
            chip.setBackgroundResource(R.drawable.segment_selected_bg);
            chip.setTextColor(getColor(R.color.on_primary));
        } else {
            chip.setBackgroundResource(R.drawable.badge_chip_neutral);
            chip.setTextColor(getColor(R.color.on_surface_variant));
        }
    }

    private void addWeightedChip(LinearLayout container, TextView chip) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        int padV = (int) dp(14);
        if (container.getChildCount() > 0) params.leftMargin = (int) dp(8);
        chip.setPadding((int) dp(8), padV, (int) dp(8), padV);
        chip.setLayoutParams(params);
        container.addView(chip);
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }

    private void runFullScan(boolean systemFilesFull, String operatorVehicleInfo) {
        log("========================================");
        log("JaeDriveProbe - scan starting");
        log("========================================");
        log("System files: " + (systemFilesFull ? "ON (all desaysv/vds/tbox packages)" : "OFF (signal-decoding APKs only)"));
        log("Operator-reported vehicle: " + operatorVehicleInfo);
        log("Build.MANUFACTURER=" + Build.MANUFACTURER + " Build.BRAND=" + Build.BRAND);
        log("Build.MODEL=" + Build.MODEL + " Build.DEVICE=" + Build.DEVICE + " Build.PRODUCT=" + Build.PRODUCT);
        log("Build.DISPLAY=" + Build.DISPLAY);
        log("Build.FINGERPRINT=" + Build.FINGERPRINT);
        log("Android " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")");

        status("Screen...");
        dumpScreenInfo();

        status("getprop...");
        dumpGetprop();

        status("android.car properties...");
        dumpCarProperties();

        status("Desay VDB bus (this may take a minute)...");
        dumpVdbSweep();

        status("Vehicle config (brand/platform/motorization bytes)...");
        dumpVehicleConfig();

        status("TBox status (Neusoft ContentProvider)...");
        dumpTboxProvider();

        status("Desay/VDS system APKs...");
        dumpSystemApks(systemFilesFull);

        status("Packaging results...");
        String zipName = "JaeDriveProbe_" + DateFormat.format("yyyyMMdd_HHmmss", System.currentTimeMillis()) + ".zip";
        File localZip = buildPasswordProtectedZip(zipName);

        status("Copying to USB...");
        boolean copiedToUsb = localZip != null && copyToUsbVerified(localZip);
        if (copiedToUsb) {
            boolean deleted = localZip.delete();
            log(deleted ? "Copy verified OK, internal copy removed."
                : "Copy verified OK, but could not remove internal copy: " + localZip.getName());
        }

        log("========================================");
        log("Scan complete.");
        log(localZip != null
            ? "File: " + zipName
            : "ERROR: archive was not created, see log above");
        log("========================================");
        status(localZip == null ? "Done - archive creation failed, see log above"
            : copiedToUsb ? "Done - copied to USB and verified (" + zipName + ")"
            : "Done - saved internally only (" + localZip.getAbsolutePath() + "), no verified USB copy - use RETRY USB COPY later");
        mainHandler.post(() -> {
            btnStart.setEnabled(true);
            checkForPendingInternalZip();
        });
    }

    // ------------------------------------------------------------------
    // 1. Schermo: risoluzione, densita', bucket - stessi valori che hanno permesso di
    // scoprire che l'AVD di test usava 240dpi invece dei 160dpi reali della Jaecoo 7.
    // ------------------------------------------------------------------
    private void dumpScreenInfo() {
        log("--- SCREEN ---");
        DisplayMetrics dm = getResources().getDisplayMetrics();
        Configuration cfg = getResources().getConfiguration();
        log(String.format(Locale.US, "widthPixels=%d heightPixels=%d", dm.widthPixels, dm.heightPixels));
        log(String.format(Locale.US, "density=%.2f densityDpi=%d (bucket=%s)", dm.density, dm.densityDpi, densityBucketName(dm.densityDpi)));
        log(String.format(Locale.US, "xdpi=%.2f ydpi=%.2f (real physical panel dpi)", dm.xdpi, dm.ydpi));
        log(String.format(Locale.US, "screenWidthDp=%d screenHeightDp=%d smallestScreenWidthDp=%d",
            cfg.screenWidthDp, cfg.screenHeightDp, cfg.smallestScreenWidthDp));
        log("orientation=" + (cfg.orientation == Configuration.ORIENTATION_LANDSCAPE ? "LANDSCAPE" : "PORTRAIT"));
        double diagPx = Math.sqrt((double) dm.widthPixels * dm.widthPixels + (double) dm.heightPixels * dm.heightPixels);
        double diagInches = diagPx / dm.densityDpi;
        log(String.format(Locale.US, "Estimated diagonal: %.1f\" (derived from resolution/density, indicative only)", diagInches));
    }

    private String densityBucketName(int dpi) {
        if (dpi <= 120) return "ldpi";
        if (dpi <= 160) return "mdpi";
        if (dpi <= 213) return "tvdpi";
        if (dpi <= 240) return "hdpi";
        if (dpi <= 320) return "xhdpi";
        if (dpi <= 480) return "xxhdpi";
        if (dpi <= 640) return "xxxhdpi";
        return "xxxhdpi+";
    }

    // ------------------------------------------------------------------
    // 2. getprop completo - e' cosi' che si e' scoperta la vera densita' (ro.sf.lcd_density)
    // e il modello di pannello (ro.desay.display.ivi) della Jaecoo 7 partendo da un dump.
    // Nessun permesso speciale: qualunque app puo' eseguire un comando shell via
    // Runtime.exec(), non serve root.
    // ------------------------------------------------------------------
    private void dumpGetprop() {
        log("--- GETPROP (full system properties) ---");
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"getprop"});
            StringBuilder out = new StringBuilder();
            try (InputStream is = p.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = is.read(buf)) != -1) out.append(new String(buf, 0, n));
            }
            p.waitFor(10, TimeUnit.SECONDS);
            log(out.toString());
        } catch (Exception e) {
            log("Error running getprop: " + e);
        }
    }

    // ------------------------------------------------------------------
    // 3. android.car - enumera TUTTE le CarPropertyConfig esposte dal VHAL (standard, non
    // proprietario Desay) e prova a leggerne il valore. Stesso identico approccio gia'
    // verificato in JaeDrive stessa (MainActivity.discoverAllProperties()).
    // ------------------------------------------------------------------
    private void dumpCarProperties() {
        log("--- ANDROID.CAR: CarPropertyManager.getPropertyList() ---");
        CountDownLatch connected = new CountDownLatch(1);
        try {
            mCar = Car.createCar(this, new ServiceConnection() {
                @Override
                public void onServiceConnected(ComponentName name, IBinder service) {
                    try {
                        mCarPropertyManager = (CarPropertyManager) mCar.getCarManager(Car.PROPERTY_SERVICE);
                    } catch (Exception e) {
                        log("getCarManager EXCEPTION: " + e);
                    }
                    connected.countDown();
                }

                @Override
                public void onServiceDisconnected(ComponentName name) {
                }
            });
            if (mCar != null) mCar.connect();
        } catch (Throwable t) {
            // Throwable, non solo Exception: su un dispositivo senza il vero framework
            // android.car (es. un telefono qualunque usato per errore) questo lancia
            // NoClassDefFoundError, non una Exception normale - vogliamo comunque
            // continuare con getprop/VDB invece di far morire tutta la scansione.
            log("Car.createCar FAILED (likely not an Android Automotive head unit): " + t);
            return;
        }
        try {
            if (!connected.await(8, TimeUnit.SECONDS)) {
                log("Timeout connecting to Car service");
                return;
            }
        } catch (InterruptedException ignored) {
        }
        if (mCarPropertyManager == null) {
            log("CarPropertyManager not available");
            return;
        }

        Map<Integer, String> nameMap = buildPropertyNameMap();
        List<CarPropertyConfig> configs;
        try {
            configs = mCarPropertyManager.getPropertyList();
        } catch (Exception e) {
            log("getPropertyList EXCEPTION: " + e);
            return;
        }
        log("Found " + configs.size() + " properties");
        for (CarPropertyConfig<?> cfg : configs) {
            int id = cfg.getPropertyId();
            String name = nameMap.getOrDefault(id, "UNKNOWN/VENDOR");
            log(String.format(Locale.US, "0x%08X %s  access=%s change=%s areas=%s",
                id, name, accessToString(cfg.getAccess()), changeModeToString(cfg.getChangeMode()),
                Arrays.toString(cfg.getAreaIds())));
            if (cfg.getAccess() == CarPropertyConfig.VEHICLE_PROPERTY_ACCESS_READ
                    || cfg.getAccess() == CarPropertyConfig.VEHICLE_PROPERTY_ACCESS_READ_WRITE) {
                int[] areas = cfg.getAreaIds();
                int area = (areas != null && areas.length > 0) ? areas[0] : 0;
                try {
                    CarPropertyValue<?> val = mCarPropertyManager.getProperty(id, area);
                    log("   -> value: " + (val != null ? valueToString(val.getValue()) : "null"));
                } catch (Exception e) {
                    log("   -> read error: " + e.getClass().getSimpleName() + " " + e.getMessage());
                }
            }
        }
        try {
            if (mCar != null) mCar.disconnect();
        } catch (Exception ignored) {
        }
    }

    private Map<Integer, String> buildPropertyNameMap() {
        Map<Integer, String> map = new HashMap<>();
        for (Field f : VehiclePropertyIds.class.getFields()) {
            if (f.getType() == int.class) {
                try {
                    map.put(f.getInt(null), f.getName());
                } catch (Exception ignored) {
                }
            }
        }
        return map;
    }

    private String valueToString(Object val) {
        if (val == null) return "null";
        if (val instanceof Object[]) return Arrays.deepToString((Object[]) val);
        if (val instanceof int[]) return Arrays.toString((int[]) val);
        if (val instanceof long[]) return Arrays.toString((long[]) val);
        if (val instanceof float[]) return Arrays.toString((float[]) val);
        if (val instanceof boolean[]) return Arrays.toString((boolean[]) val);
        if (val instanceof byte[]) return Arrays.toString((byte[]) val);
        return val.toString();
    }

    private String accessToString(int access) {
        if (access == CarPropertyConfig.VEHICLE_PROPERTY_ACCESS_READ) return "READ";
        if (access == CarPropertyConfig.VEHICLE_PROPERTY_ACCESS_WRITE) return "WRITE";
        if (access == CarPropertyConfig.VEHICLE_PROPERTY_ACCESS_READ_WRITE) return "READ_WRITE";
        return "NONE";
    }

    private String changeModeToString(int mode) {
        if (mode == CarPropertyConfig.VEHICLE_PROPERTY_CHANGE_MODE_CONTINUOUS) return "CONTINUOUS";
        if (mode == CarPropertyConfig.VEHICLE_PROPERTY_CHANGE_MODE_ONCHANGE) return "ON_CHANGE";
        if (mode == CarPropertyConfig.VEHICLE_PROPERTY_CHANGE_MODE_STATIC) return "STATIC";
        return "UNKNOWN";
    }

    // ------------------------------------------------------------------
    // 4. Bus VDB Desay (proprietario, non-standard) - a differenza di android.car sopra,
    // qui non esiste un "elenca tutto quello che c'e'": bisogna interrogare modulo+cmdId
    // uno per uno e vedere chi risponde. Scansione a tappeto di tutti i moduli gia' noti
    // (vedi VDInfoClient.java in JaeDrive) su ogni cmdId da 0x00 a 0xFF - e' esattamente
    // il protocollo IVDBus.get() gia' reverse-engineered per la Jaecoo 7, qui riusato
    // cosi' com'e' per sondare un'auto diversa.
    // ------------------------------------------------------------------
    private void dumpVdbSweep() {
        log("--- DESAY VDB BUS: module/cmdId sweep ---");
        CountDownLatch connected = new CountDownLatch(1);
        ServiceConnection connection = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder binder) {
                vdBus = IVDBus.Stub.asInterface(binder);
                log("Connected to CAR_INFO VDB service: " + name);
                connected.countDown();
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                vdBus = null;
            }
        };
        try {
            Intent intent = new Intent(CARINFO_ACTION);
            intent.setPackage(CARINFO_PKG);
            boolean ok = bindService(intent, connection, Context.BIND_AUTO_CREATE);
            log("bindService CAR_INFO: " + (ok ? "started" : "FAILED - Desay VDB service not present on this device"));
            if (!ok) return;
        } catch (Exception e) {
            log("bindService CAR_INFO error: " + e);
            return;
        }
        try {
            if (!connected.await(8, TimeUnit.SECONDS)) {
                log("Timeout connecting to VDB bus");
                return;
            }
        } catch (InterruptedException ignored) {
        }
        if (vdBus == null) {
            log("IVDBus null after bind");
            return;
        }

        int totalFound = 0;
        for (int module : MODULES_TO_SWEEP) {
            log(String.format(Locale.US, "  module 0x%X:", module));
            int foundInModule = 0;
            for (int cmdId = 0; cmdId <= MAX_CMD_ID; cmdId++) {
                try {
                    Bundle payload = new Bundle();
                    payload.putInt("CMD_ID", cmdId);
                    VDEvent request = new VDEvent(module, payload);
                    VDEvent response = vdBus.get(request);
                    if (response == null) continue;
                    Bundle result = response.getPayload();
                    if (result == null) continue;
                    boolean isNull = result.getBoolean("IS_NULL", false);
                    int[] value = result.getIntArray("VALUE");
                    if (isNull || value == null) continue;
                    log(String.format(Locale.US, "    CMD_ID=0x%02X -> %s", cmdId, Arrays.toString(value)));
                    foundInModule++;
                    totalFound++;
                } catch (Exception ignored) {
                    // La stragrande maggioranza dei cmdId non registrati lancia un'eccezione
                    // di binder invece di tornare IS_NULL=true - normale, si salta e basta.
                }
            }
            log(String.format(Locale.US, "  -> %d active signals found in module 0x%X", foundInModule, module));
        }
        log("Total active VDB signals found: " + totalFound);

        try {
            unbindService(connection);
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------
    // 4a. Config veicolo bit-packed - stesso modulo VDB del part number (0xE0006) ma servizio
    // Android diverso (VEHICLE_DEVICE, vedi costanti sopra), usato da CarConfigUtil/EolConfig
    // in SVSetting.apk (decompilato) per determinare marca/piattaforma/motorizzazione/trazione
    // SENZA la lista di ~230 part number che JaeDrive aveva individuato in precedenza: si legge
    // il part number piu' 8 stringhe di "config" (una decimale a cifra singola invertita per
    // marca/piattaforma - vehicle.persist.combo.config, sette esadecimali per gli altri byte -
    // vehicle.persist.project.ext.configs[2..7]) e se ne estraggono singoli byte/nibble a offset
    // fissi, esattamente come fa EolConfig.getCheryEolConfig() nell'OEM (verificato leggendo lo
    // smali istruzione per istruzione, non dedotto dai nomi dei metodi):
    //   marca        = combo[13] (0=Chery, 4=Omoda, 6=Jaecoo; combo[25]==0 conferma)
    //   piattaforma  = combo[1]  (codename interno, es. 9=T1EJ=Jaecoo 7 - unico confermato finora)
    //   motorizzazione = (configs5[4]>>4)&3 (1=PHEV, 2=EV, 3=HEV se anche configs7[2]&0xF==1)
    //   trazione     = configs6[2]&7 (0/1/5/7=2WD, 2/3/4/6=4WD - stesso flag mIs4Wd/mIs2Wd gia'
    //                  citato nei commenti di EnergyFlowUtil.java in app/)
    // NON esiste nel codice OEM un dizionario "piattaforma -> nome commerciale" (solo codename
    // interni) - per questo l'onboarding operatore sopra chiede il nome vero: il confronto va
    // fatto a mano guardando dump.txt finche' non si accumulano abbastanza test sul campo.
    // ------------------------------------------------------------------
    private void dumpVehicleConfig() {
        log("--- VEHICLE CONFIG (brand/platform/motorization/drivetrain bytes, module 0xE0006) ---");
        CountDownLatch connected = new CountDownLatch(1);
        final IVDBus[] holder = new IVDBus[1];
        ServiceConnection connection = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder binder) {
                holder[0] = IVDBus.Stub.asInterface(binder);
                log("Connected to VEHICLE_DEVICE VDB service: " + name);
                connected.countDown();
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                holder[0] = null;
            }
        };
        try {
            Intent intent = new Intent();
            intent.setClassName(VDEV_PKG, VDEV_SERVICE_CLASS);
            boolean ok = bindService(intent, connection, Context.BIND_AUTO_CREATE);
            log("bindService VEHICLE_DEVICE: " + (ok ? "started" : "FAILED - service not present on this device"));
            if (!ok) return;
        } catch (Exception e) {
            log("bindService VEHICLE_DEVICE error: " + e);
            return;
        }
        try {
            if (!connected.await(8, TimeUnit.SECONDS)) {
                log("Timeout connecting to vehicle config service");
                return;
            }
        } catch (InterruptedException ignored) {
        }
        IVDBus vdev = holder[0];
        if (vdev == null) {
            log("IVDBus null after bind (vehicle config)");
            return;
        }

        String partNumber = readConfigString(vdev, "vehicle.persist.project.pn");
        log("Part number (vehicle.persist.project.pn) = " + partNumber);

        String comboRaw = readConfigString(vdev, "vehicle.persist.combo.config");
        int[] combo = comboRaw != null ? decodeDigitsReversed(comboRaw) : null;
        log("vehicle.persist.combo.config raw=" + comboRaw + " decoded=" + (combo != null ? Arrays.toString(combo) : "null"));

        int[][] extConfigs = new int[8][]; // indici 1..7 usati (chiave senza suffisso = "1")
        for (int i = 1; i <= 7; i++) {
            String key = "vehicle.persist.project.ext.configs" + (i == 1 ? "" : String.valueOf(i));
            String raw = readConfigString(vdev, key);
            extConfigs[i] = raw != null ? decodeHexBytes(raw) : null;
            log(key + " raw=" + raw + " decoded=" + (extConfigs[i] != null ? Arrays.toString(extConfigs[i]) : "null"));
        }

        Integer brand = arrayGet(combo, 13);
        Integer brandTiebreak = arrayGet(combo, 25);
        Integer platform = arrayGet(combo, 1);
        Integer configs5at4 = arrayGet(extConfigs[5], 4);
        Integer configs6at2 = arrayGet(extConfigs[6], 2);
        Integer configs7at2 = arrayGet(extConfigs[7], 2);

        log("Derived brand byte (combo[13]) = " + brand + " -> " + brandName(brand)
            + " | tie-break (combo[25]) = " + brandTiebreak + " (expected 0)");
        log("Derived platform byte (combo[1]) = " + platform + platformNote(platform));
        Integer powertrain = configs5at4 != null ? (configs5at4 >> 4) & 3 : null;
        Integer hevFlag = configs7at2 != null ? configs7at2 & 0xF : null;
        log("Derived powertrain byte ((configs5[4]>>4)&3) = " + powertrain + " -> " + powertrainName(powertrain, hevFlag));
        Integer driveForm = configs6at2 != null ? configs6at2 & 7 : null;
        log("Derived drivetrain byte (configs6[2]&7) = " + driveForm + " -> " + driveFormName(driveForm));

        try {
            unbindService(connection);
        } catch (Exception ignored) {
        }
    }

    private String readConfigString(IVDBus vdev, String type) {
        try {
            Bundle payload = new Bundle();
            payload.putString("type", type);
            VDEvent request = new VDEvent(MODULE_PROJECT_CONFIG, payload);
            VDEvent response = vdev.get(request);
            if (response == null) return null;
            Bundle result = response.getPayload();
            if (result == null) return null;
            return result.getString("value");
        } catch (Exception e) {
            log("  " + type + " -> read error: " + e.getClass().getSimpleName() + " " + e.getMessage());
            return null;
        }
    }

    // Replica di Utils.stringToByte() decompilato da SVSetting.apk: coppie consecutive di 2
    // caratteri esadecimali -> un byte (0-255) per elemento.
    private int[] decodeHexBytes(String s) {
        int n = s.length() / 2;
        int[] out = new int[n];
        for (int i = 0; i < n; i++) {
            try {
                out[i] = Integer.parseInt(s.substring(i * 2, i * 2 + 2), 16);
            } catch (Exception e) {
                out[i] = 0;
            }
        }
        return out;
    }

    // Replica di Utils.stringToIntArray() decompilato da SVSetting.apk: un elemento per
    // carattere (singola cifra decimale 0-9), letti in ordine INVERTITO rispetto alla stringa
    // grezza - comportamento verificato istruzione per istruzione nello smali, non intuitivo.
    private int[] decodeDigitsReversed(String s) {
        int n = s.length();
        int[] out = new int[n];
        for (int i = 0; i < n; i++) {
            char c = s.charAt(n - i - 1);
            try {
                out[i] = Integer.parseInt(String.valueOf(c));
            } catch (Exception e) {
                out[i] = 0;
            }
        }
        return out;
    }

    private Integer arrayGet(int[] arr, int idx) {
        if (arr == null || idx >= arr.length) return null;
        return arr[idx];
    }

    private String brandName(Integer b) {
        if (b == null) return "unknown (array too short/unavailable)";
        if (b == 0) return "Chery (base)";
        if (b == 4) return "Omoda";
        if (b == 6) return "Jaecoo";
        return "unrecognized brand code " + b + " (not yet seen - log it, don't guess)";
    }

    private String platformNote(Integer p) {
        if (p == null) return " -> unknown (array too short/unavailable)";
        if (p == 9) return " -> T1EJ (confirmed = Jaecoo 7, verified via Build.DISPLAY on this project's own car)";
        return " -> unknown platform codename (no confirmed mapping yet - correlate with the operator answer above)";
    }

    private String powertrainName(Integer v, Integer hevFlag) {
        if (v == null) return "unknown";
        switch (v) {
            case 1: return "PHEV";
            case 2: return "EV/BEV";
            case 3: return (hevFlag != null && hevFlag == 1) ? "HEV" : "HEV (unconfirmed - HEV-flag byte was " + hevFlag + ", expected 1)";
            default: return "ICE (value 0/other) or unrecognized code " + v;
        }
    }

    private String driveFormName(Integer v) {
        if (v == null) return "unknown";
        switch (v) {
            case 0: case 1: case 5: case 7: return "2WD";
            case 2: case 3: case 4: case 6: return "4WD";
            default: return "unrecognized code " + v;
        }
    }

    // ------------------------------------------------------------------
    // 4b. TBox: query di sola lettura sul ContentProvider Neusoft (vedi costanti sopra).
    // ContentResolver.query() non e' un'azione, e' l'equivalente di una GET - nessuna delle
    // URI qui dentro compone chiamate, avvia OTA o tocca la batteria alta tensione. Se il
    // provider non esiste su questo dispositivo (es. nessun TBox, o non e' questo il nome
    // authority su un altro fornitore) query() lancia un'eccezione gestita per singola URI,
    // cosi' un fallimento su una non blocca le altre.
    // ------------------------------------------------------------------
    private void dumpTboxProvider() {
        log("--- TBOX (Neusoft ContentProvider, read-only status queries) ---");
        for (String cmd : TBOX_STATUS_QUERIES) {
            Uri uri = Uri.parse("content://" + TBOX_AUTHORITY + "/req?cmd=" + cmd);
            try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
                if (c == null) {
                    log("  " + cmd + " -> null cursor (provider not present or cmd unknown)");
                    continue;
                }
                String[] columns = c.getColumnNames();
                log("  " + cmd + " -> " + c.getCount() + " row(s), columns=" + Arrays.toString(columns));
                while (c.moveToNext()) {
                    StringBuilder row = new StringBuilder("    ");
                    for (int i = 0; i < columns.length; i++) {
                        if (i > 0) row.append(", ");
                        row.append(columns[i]).append("=").append(c.getString(i));
                    }
                    log(row.toString());
                }
            } catch (Exception e) {
                log("  " + cmd + " -> " + e.getClass().getSimpleName() + " " + e.getMessage());
            }
        }
    }

    // ------------------------------------------------------------------
    // 5. Copia gli APK di sistema Desay/VDS installati su QUESTA vettura, cosi' si possono
    // decompilare offline esattamente come gia' fatto per la Jaecoo 7 (vedi
    // jaedrive_decompiled_apks in memoria) - senza bisogno di adb/USB debugging sull'altra
    // auto. Richiede QUERY_ALL_PACKAGES per trovarli tutti, anche quelli mai visti prima.
    // Puo' fallire per permessi del filesystem su ROM piu' blindate (gia' confermato che la
    // Jaecoo 7 dell'utente e' una build "user" completamente chiusa) - se fallisce, il resto
    // del dump resta comunque utile.
    // ------------------------------------------------------------------
    private void dumpSystemApks(boolean systemFilesFull) {
        log("--- SYSTEM APKS (desaysv/desay/vds/tbox/neusoft packages) ---");
        log(systemFilesFull
            ? "Mode: ALL matching system packages"
            : "Mode: minimal set only (" + MINIMAL_APK_PACKAGES.length + " APKs needed to decode already-handled VDB signals)");
        PackageManager pm = getPackageManager();
        List<PackageInfo> allPackages;
        try {
            allPackages = pm.getInstalledPackages(0);
        } catch (Exception e) {
            log("getInstalledPackages EXCEPTION: " + e);
            return;
        }
        List<ApplicationInfo> matches = new ArrayList<>();
        for (PackageInfo pi : allPackages) {
            String pkg = pi.packageName.toLowerCase(Locale.US);
            // tbox/neusoft (2026-08-07, indagine climatizzazione remota): l'app che dispaccia
            // davvero i comandi sul ContentProvider di dumpTboxProvider() non e' Desay - e'
            // presumibilmente un pacchetto separato del fornitore del modulo telematico
            // (Neusoft, vedi authority "tbox.automotive.neusoft.com"), mai vista finora.
            boolean isDesaySystemPkg = pkg.contains("desaysv") || pkg.contains("desay") || pkg.contains(".vds.")
                    || pkg.contains("tbox") || pkg.contains("neusoft");
            if (!isDesaySystemPkg) continue;
            if (systemFilesFull || isMinimalApkPackage(pkg)) {
                matches.add(pi.applicationInfo);
            }
        }
        log("Found " + matches.size() + " matching packages out of " + allPackages.size() + " installed");

        File outDir = new File(getExternalFilesDir(null), "apks");
        outDir.mkdirs();
        for (ApplicationInfo ai : matches) {
            log("  " + ai.packageName + " -> sourceDir=" + ai.sourceDir);
            copyApk(ai.sourceDir, new File(outDir, ai.packageName + ".apk"));
            if (ai.splitSourceDirs != null) {
                for (int i = 0; i < ai.splitSourceDirs.length; i++) {
                    copyApk(ai.splitSourceDirs[i], new File(outDir, ai.packageName + ".split" + i + ".apk"));
                }
            }
        }
        if (!matches.isEmpty()) {
            log("APKs copied (where successful) to: " + outDir.getAbsolutePath() + " - will be bundled into the export");
        }
    }

    private boolean isMinimalApkPackage(String pkg) {
        for (String p : MINIMAL_APK_PACKAGES) {
            if (pkg.equals(p)) return true;
        }
        return false;
    }

    private void copyApk(String sourcePath, File dest) {
        try (FileInputStream in = new FileInputStream(sourcePath);
             FileOutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[8192];
            int n;
            long total = 0;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                total += n;
            }
            log("    copied OK (" + (total / 1024) + " KB) -> " + dest.getName());
        } catch (Exception e) {
            log("    copy FAILED (" + sourcePath + "): " + e.getClass().getSimpleName() + " " + e.getMessage()
                + " - likely a filesystem restriction on this ROM, not a tool bug");
        }
    }

    // ------------------------------------------------------------------
    // 6. Archivio finale: uno zip AES-256 protetto da password (zip4j - richiesta esplicita
    // utente 2026-08-05) contenente il log completo e gli eventuali APK estratti sopra.
    // Salvato prima in storage interno dell'app (getFilesDir(), sempre scrivibile, nessun
    // permesso richiesto) e rimosso da li' SOLO dopo che copyToUsbVerified() conferma che la
    // copia sulla chiavetta e' arrivata integra (vedi sotto) - se la copia fallisce o non si
    // riesce a verificare, il file interno resta e puo' essere ricopiato in un secondo
    // momento col pulsante RETRY USB COPY, senza dover rifare l'intera scansione (gap reale
    // trovato sul campo 2026-08-08: un export da 1.7GB troncato a meta' copia).
    // La password stessa NON deve mai comparire nel log ne' un riferimento al fatto che
    // l'export sia protetto (richiesta esplicita utente): chi esegue la scansione su
    // un'auto non sua non ha bisogno di saperlo.
    // ------------------------------------------------------------------
    private File buildPasswordProtectedZip(String zipName) {
        File dumpFile = new File(getFilesDir(), "dump.txt");
        try (FileOutputStream fos = new FileOutputStream(dumpFile)) {
            fos.write(fullLog.toString().getBytes());
        } catch (Exception e) {
            log("Failed to write dump file: " + e);
            return null;
        }

        File zipFile = new File(getFilesDir(), zipName);
        if (zipFile.exists()) zipFile.delete();
        try {
            ZipParameters params = new ZipParameters();
            params.setEncryptFiles(true);
            params.setEncryptionMethod(EncryptionMethod.AES);
            params.setAesKeyStrength(AesKeyStrength.KEY_STRENGTH_256);

            ZipFile zf = new ZipFile(zipFile, getZipPassword());
            zf.addFile(dumpFile, params);

            File apksDir = new File(getExternalFilesDir(null), "apks");
            File[] apks = apksDir.listFiles();
            if (apks != null) {
                for (File apk : apks) {
                    zf.addFile(apk, params);
                }
            }
            log("Archive created: " + zipFile.getName());
            return zipFile;
        } catch (Exception e) {
            log("Failed to create archive: " + e);
            return null;
        }
    }

    // ------------------------------------------------------------------
    // 7. Export su USB - stesso approccio gia' verificato in JaeDrive (MainActivity.
    // writeToUsbRoot()): MANAGE_EXTERNAL_STORAGE + StorageVolume.getDirectory(), niente
    // selettore SAF (assente su questo ROM). Copia il solo zip gia' costruito sopra, poi la
    // VERIFICA byte per byte prima di dichiararla riuscita (vedi copyOneFileVerified) - trovato
    // sul campo (2026-08-08) un export da 1.7GB su chiavetta FAT32 che risultava piu' grande
    // dei dati reali e con in coda frammenti di file gia' cancellati: sintomo di una scrittura
    // interrotta (chiavetta scollegata o app killata a meta' copia) senza che l'app se ne
    // accorgesse, perche' il vecchio codice dichiarava successo appena il loop di copia finiva
    // senza eccezioni, senza forzare il flush ne' controllare che i byte scritti corrispondessero
    // davvero all'originale.
    // ------------------------------------------------------------------
    private boolean copyToUsbVerified(File localZip) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            log("Needs the 'All files access' permission - opening settings, grant it and run again");
            try {
                Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(android.net.Uri.parse("package:" + getPackageName()));
                startActivity(intent);
                mainHandler.post(() -> Toast.makeText(this, "Grant access and run again", Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                log("Could not open permission settings: " + e);
            }
            return false;
        }
        List<File> usbRoots = findRemovableVolumeRoots();
        if (usbRoots.isEmpty()) {
            log("No removable USB volume found - result kept in app internal storage only: " + localZip.getAbsolutePath());
            return false;
        }
        long sourceLength = localZip.length();
        long sourceCrc = computeCrc32(localZip);
        if (sourceCrc < 0) {
            log("Could not read back local archive to verify (" + localZip.getAbsolutePath() + ") - aborting USB copy");
            return false;
        }
        boolean allVerified = true;
        for (File root : usbRoots) {
            File dest = new File(root, localZip.getName());
            allVerified &= copyOneFileVerified(localZip, dest, sourceLength, sourceCrc);
        }
        return allVerified;
    }

    private boolean copyOneFileVerified(File source, File dest, long expectedLength, long expectedCrc) {
        try (FileInputStream in = new FileInputStream(source);
             FileOutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            out.flush();
            // Forza la scrittura fisica sul supporto PRIMA di verificare - altrimenti su
            // FAT32 uno scollegamento subito dopo l'ultimo write() puo' lasciare il file con
            // la dimensione "dichiarata" giusta ma dati non ancora arrivati fisicamente sulla
            // chiavetta, esponendo in coda blocchi vecchi non sovrascritti (esattamente quanto
            // successo sul campo, vedi commento sopra).
            out.getFD().sync();
        } catch (Exception e) {
            log("Error copying to USB " + dest + ": " + e);
            return false;
        }
        long destLength = dest.length();
        long destCrc = computeCrc32(dest);
        if (destLength != expectedLength || destCrc != expectedCrc) {
            log("Copy to " + dest.getAbsolutePath() + " FAILED verification (length " + destLength
                + " vs " + expectedLength + " bytes, crc32 " + Long.toHexString(destCrc) + " vs "
                + Long.toHexString(expectedCrc) + ") - USB write likely interrupted, keeping internal copy");
            return false;
        }
        log("Copied and verified on USB: " + dest.getAbsolutePath());
        return true;
    }

    private long computeCrc32(File file) {
        CRC32 crc = new CRC32();
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) != -1) crc.update(buf, 0, n);
            return crc.getValue();
        } catch (Exception e) {
            log("CRC32 read error on " + file + ": " + e);
            return -1;
        }
    }

    private List<File> findRemovableVolumeRoots() {
        List<File> roots = new ArrayList<>();
        try {
            android.os.storage.StorageManager sm =
                (android.os.storage.StorageManager) getSystemService(Context.STORAGE_SERVICE);
            for (android.os.storage.StorageVolume v : sm.getStorageVolumes()) {
                if (!v.isRemovable() || v.isPrimary()) continue;
                File dir = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ? v.getDirectory() : null;
                if (dir != null) roots.add(dir);
            }
        } catch (Exception e) {
            log("Error looking up removable volumes: " + e);
        }
        return roots;
    }
}
