package com.phabryc.jaedriveprobe;

import android.app.Activity;
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
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.format.DateFormat;
import android.util.DisplayMetrics;
import android.widget.Button;
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
    private static final int[] MODULES_TO_SWEEP = {
        MODULE_CAR_SETTING, MODULE_NEW_ENERGY, MODULE_READONLY_INFO, MODULE_DOANOSE, MODULE_CAR_COMPUTER
    };
    private static final int MAX_CMD_ID = 0xFF;

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
        btnStart.setOnClickListener(v -> {
            btnStart.setEnabled(false);
            fullLog.setLength(0);
            tvLog.setText("");
            new Thread(this::runFullScan, "ProbeScan").start();
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

    private void runFullScan() {
        log("========================================");
        log("JaeDriveProbe - scan starting");
        log("========================================");
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

        status("Desay/VDS system APKs...");
        dumpSystemApks();

        status("Packaging results...");
        String zipName = "JaeDriveProbe_" + DateFormat.format("yyyyMMdd_HHmmss", System.currentTimeMillis()) + ".zip";
        File localZip = buildPasswordProtectedZip(zipName);

        status("Copying to USB...");
        boolean copiedToUsb = localZip != null && copyToUsb(localZip);

        log("========================================");
        log("Scan complete.");
        log(localZip != null
            ? "File: " + zipName
            : "ERROR: archive was not created, see log above");
        log("========================================");
        status(localZip == null ? "Done - archive creation failed, see log above"
            : copiedToUsb ? "Done - copied to USB (" + zipName + ")"
            : "Done - saved internally only (" + localZip.getAbsolutePath() + "), no writable USB volume found");
        mainHandler.post(() -> btnStart.setEnabled(true));
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
    // 5. Copia gli APK di sistema Desay/VDS installati su QUESTA vettura, cosi' si possono
    // decompilare offline esattamente come gia' fatto per la Jaecoo 7 (vedi
    // jaedrive_decompiled_apks in memoria) - senza bisogno di adb/USB debugging sull'altra
    // auto. Richiede QUERY_ALL_PACKAGES per trovarli tutti, anche quelli mai visti prima.
    // Puo' fallire per permessi del filesystem su ROM piu' blindate (gia' confermato che la
    // Jaecoo 7 dell'utente e' una build "user" completamente chiusa) - se fallisce, il resto
    // del dump resta comunque utile.
    // ------------------------------------------------------------------
    private void dumpSystemApks() {
        log("--- SYSTEM APKS (desaysv/desay/vds packages) ---");
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
            if (pkg.contains("desaysv") || pkg.contains("desay") || pkg.contains(".vds.")) {
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
    // permesso richiesto) cosi' la scansione non va mai persa anche se poi la copia su USB
    // fallisce - era un gap reale identificato prima di questo rework (vedi cronologia).
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
    // selettore SAF (assente su questo ROM). Copia il solo zip gia' costruito sopra.
    // ------------------------------------------------------------------
    private boolean copyToUsb(File localZip) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            log("Needs the 'All files access' permission - opening settings, grant it and run the scan again");
            try {
                Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(android.net.Uri.parse("package:" + getPackageName()));
                startActivity(intent);
                mainHandler.post(() -> Toast.makeText(this, "Grant access and run the scan again", Toast.LENGTH_LONG).show());
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
        boolean saved = false;
        for (File root : usbRoots) {
            File dest = new File(root, localZip.getName());
            try (FileInputStream in = new FileInputStream(localZip);
                 FileOutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                log("Copied to USB: " + dest.getAbsolutePath());
                saved = true;
            } catch (Exception e) {
                log("Error copying to USB " + dest + ": " + e);
            }
        }
        return saved;
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
