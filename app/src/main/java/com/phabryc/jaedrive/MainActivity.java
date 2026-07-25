package com.phabryc.jaedrive;

import android.Manifest;
import android.animation.ObjectAnimator;
import android.car.Car;
import android.car.VehiclePropertyIds;
import android.car.hardware.CarPropertyConfig;
import android.car.hardware.CarPropertyValue;
import android.car.hardware.property.CarPropertyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.text.format.DateFormat;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SwitchCompat;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.osmdroid.config.Configuration;
import org.osmdroid.tileprovider.tilesource.TileSourceFactory;
import org.osmdroid.util.BoundingBox;
import org.osmdroid.util.GeoPoint;
import org.osmdroid.views.MapView;
import org.osmdroid.views.overlay.Polyline;

import java.io.File;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// UI secondo il design system "Aetheris Automotive" (Google Stitch, progetto
// "Jaecoo Trip Monitor"): nav drawer verticale fissa + 4 sezioni (Dashboard,
// Storico Viaggi, Impostazioni, Log), card "glass" scure con accento blu elettrico.
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "JaeDrive";

    private Car mCar;
    private CarPropertyManager mCarPropertyManager;

    // Nav drawer: icona + label testuale
    private View navDashboard, navStorico, navImpostazioni, navLog;
    private ImageView iconNavDashboard, iconNavStorico, iconNavImpostazioni, iconNavLog;
    private TextView labelNavDashboard, labelNavStorico, labelNavImpostazioni, labelNavLog;
    private View contentDashboard, contentStorico, contentImpostazioni, contentLog;

    // Dashboard
    private TextView tvGear, tvSpeed;
    private TextView tvTripStatusBadge, tvTripAvg, tvTripKm, tvTripLiters;
    private TextView tvFooterMode, tvFooterSoc, tvFooterFuel, tvFooterFlow;
    private ImageView iconFooterMode;
    private View dotFooterFlow;
    private TextView tvManualLabelA, tvManualLabelB;
    private TextView tvManualKmA, tvManualAvgA, tvManualLitersA;
    private TextView tvManualKmB, tvManualAvgB, tvManualLitersB;
    private TextView btnEditLabelA, btnEditLabelB;
    private Button btnResetManualTripA, btnResetManualTripB;
    private View liveDot;
    private View cardTripAvg;
    private Double lastTripAvgForTrend;

    // Storico Viaggi: lista a piena larghezza con espansione verticale (accordion) -
    // il pannello di dettaglio e' UN'unica istanza condivisa, ri-agganciata di volta in
    // volta sotto la riga espansa (evita di creare piu' MapView, costose).
    private LinearLayout trackListContainer;
    private TextView toggleAuto, toggleManual;
    private String currentTrackFilter = TripRecord.TYPE_AUTO;
    private Long expandedTripId;
    // Selezione multipla per la cancellazione: entra in modalita' selezione con
    // pressione lunga su una riga o col pulsante SELEZIONA, esce con ANNULLA/cancellazione
    // avvenuta. currentTripsById e' popolata ad ogni refreshTrackList() per risalire ai
    // path gpx/log dei trip selezionati al momento della cancellazione (solo i record
    // AUTO/MANUAL veri, mai i due record "ongoing" virtuali - id negativo, non selezionabili).
    private View btnEnterSelection, btnCancelSelection, btnDeleteSelected;
    private LinearLayout selectionBar;
    private TextView tvSelectionCount;
    private boolean selectionMode = false;
    private final java.util.Set<Long> selectedTripIds = new java.util.HashSet<>();
    private final Map<Long, TripRecord> currentTripsById = new HashMap<>();
    private View tripDetailPanel;
    // mapContainer e' il contenitore vuoto fisso nel layout; mapView e' l'istanza VERA,
    // ricreata da zero ad ogni apertura online di un trip (vedi showMapForTrip()) invece
    // di essere riusata - osmdroid non riavvia i thread di download tile dopo che una
    // MapView e' stata staccata dalla finestra, solo una nuova istanza garantisce che
    // funzioni ogni volta.
    private FrameLayout mapContainer;
    private MapView mapView;
    private TripTraceView tripTraceView;
    private TextView tvMapOfflineLabel;
    private TextView tvDetailKm, tvDetailLiters, tvDetailAvg;
    private View detailRouteCard, rowDetailStart, rowDetailDestination;
    private TextView tvDetailStartAddress, tvDetailDestinationAddress;
    private View energyFlowBlocks;
    private TextView tvFlowPctEv, tvFlowPctSeries, tvFlowPctParallel, tvFlowPctCharge, tvFlowPctIdle;
    private Button btnExportDetail;

    // Impostazioni
    private TextView toggleUnitKm, toggleUnitMi, toggleUnitLiters, toggleUnitGal;
    private TextView toggleLangIt, toggleLangEn;
    private SwitchCompat switchGps, switchDebugMode;
    private TextView tvAppVersion;
    private TextView tvVehicleVin;
    private TextView tvCloudStatus, tvCloudSubtitle, btnCloudPair, btnCloudUnpair;

    // Log
    private TextView tvLog;
    private android.widget.ScrollView scrollLog;
    private Button btnSaveLog, btnClearLog;
    private final StringBuilder logBuffer = new StringBuilder();
    // True finche' l'utente resta in fondo al log (o non ha ancora scrollato): in quel
    // caso ogni nuova riga fa scrollare automaticamente in fondo, in tempo reale. Se
    // l'utente scrolla manualmente verso l'alto per leggere log piu' vecchi, l'auto-scroll
    // si disattiva (altrimenti la vista gli scapperebbe da sotto il dito ad ogni riga) e
    // si riattiva da solo non appena torna in fondo - vedi il listener in onCreate().
    private boolean logAutoScroll = true;

    private VDInfoClient vdInfoClient;
    private final Map<Integer, int[]> vdbValues = new LinkedHashMap<>();

    // export multipli in sospeso in attesa che l'utente conceda "Accesso a tutti i file"
    // (una singola esportazione da PERCORSI produce sia il .gpx sia un file di dati/log).
    private static class PendingExport {
        final String subDir; // null = radice USB (es. il log generale)
        final String filename;
        final byte[] content;
        PendingExport(String subDir, String filename, byte[] content) {
            this.subDir = subDir;
            this.filename = filename;
            this.content = content;
        }
    }
    private final List<PendingExport> pendingExports = new ArrayList<>();

    // Property IDs. PERF_ODOMETER (CAR_MILEAGE bloccato), FUEL_LEVEL e IGNITION_STATE sono
    // stati rimossi: dati fasulli/statici o irraggiungibili, sostituiti dai valori reali
    // via VDB (vedi VDInfoClient: Km totali, Carburante %).
    private static final int GEAR_SELECTION    = 0x11400400;
    private static final int CURRENT_GEAR      = 0x11400401;
    private static final int PERF_VEHICLE_SPEED = 0x11600207;
    // Property STANDARD Android Automotive per il VIN (SYSTEM|GLOBAL|STRING, id 0x100),
    // presente in android.car.VehiclePropertyIds ma non ancora provata: le due fonti VIN
    // finora tentate (vedi KEY_VIN/KEY_VIN_ALT) sono entrambe segnali proprietari Desay via
    // VDB, un canale completamente diverso da CarPropertyManager. Questa e' invece protetta
    // dal permesso dedicato android.car.permission.CAR_IDENTIFICATION (mai dichiarato finora
    // in AndroidManifest.xml) - il dump di discoverAllProperties() da un log reale in auto
    // NON la elenca fra le 26 property visibili, ma CarPropertyManager.getPropertyList()
    // filtra silenziosamente le property per cui l'app non ha il permesso PRIMA di
    // restituire la lista, quindi la sua assenza li' non prova affatto che il VHAL non la
    // implementi - prova mai fatta finora, non un "non supportata" confermato come le altre due.
    private static final int INFO_VIN = 0x11100100;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Va fatta prima di qualunque lettura di TripConsumption (es. renderTripConsumption(),
        // in coda pochi istanti dopo via startTripConsumptionRefresh()) - vedi il commento
        // su TripConsumption.migrateLegacyKeys() per il perche'.
        TripConsumption.migrateLegacyKeys(this);

        // Richiesto da osmdroid prima di creare qualunque MapView: percorso cache tile
        // + user-agent (i server OSM bloccano richieste senza uno user-agent distintivo).
        Configuration.getInstance().load(this, android.preference.PreferenceManager.getDefaultSharedPreferences(this));
        Configuration.getInstance().setUserAgentValue(getPackageName());

        setContentView(R.layout.activity_main);

        navDashboard = findViewById(R.id.nav_dashboard);
        navStorico = findViewById(R.id.nav_storico);
        navImpostazioni = findViewById(R.id.nav_impostazioni);
        navLog = findViewById(R.id.nav_log);
        iconNavDashboard = findViewById(R.id.icon_nav_dashboard);
        iconNavStorico = findViewById(R.id.icon_nav_storico);
        iconNavImpostazioni = findViewById(R.id.icon_nav_impostazioni);
        iconNavLog = findViewById(R.id.icon_nav_log);
        labelNavDashboard = findViewById(R.id.label_nav_dashboard);
        labelNavStorico = findViewById(R.id.label_nav_storico);
        labelNavImpostazioni = findViewById(R.id.label_nav_impostazioni);
        labelNavLog = findViewById(R.id.label_nav_log);
        contentDashboard = findViewById(R.id.content_dashboard);
        contentStorico = findViewById(R.id.content_storico);
        contentImpostazioni = findViewById(R.id.content_impostazioni);
        contentLog = findViewById(R.id.content_log);

        tvGear = findViewById(R.id.tv_gear);
        tvSpeed = findViewById(R.id.tv_speed);
        tvTripStatusBadge = findViewById(R.id.tv_trip_status_badge);
        tvTripAvg = findViewById(R.id.tv_trip_avg);
        tvTripKm = findViewById(R.id.tv_trip_km);
        tvTripLiters = findViewById(R.id.tv_trip_liters);
        cardTripAvg = findViewById(R.id.card_trip_avg);
        tvFooterMode = findViewById(R.id.tv_footer_mode);
        iconFooterMode = findViewById(R.id.icon_footer_mode);
        tvFooterSoc = findViewById(R.id.tv_footer_soc);
        tvFooterFuel = findViewById(R.id.tv_footer_fuel);
        tvFooterFlow = findViewById(R.id.tv_footer_flow);
        dotFooterFlow = findViewById(R.id.dot_footer_flow);
        if (dotFooterFlow.getBackground() != null) dotFooterFlow.setBackground(dotFooterFlow.getBackground().mutate());
        liveDot = findViewById(R.id.live_dot);

        tvManualLabelA = findViewById(R.id.tv_manual_label_a);
        tvManualLabelB = findViewById(R.id.tv_manual_label_b);
        tvManualKmA = findViewById(R.id.tv_manual_km_a);
        tvManualAvgA = findViewById(R.id.tv_manual_avg_a);
        tvManualLitersA = findViewById(R.id.tv_manual_liters_a);
        tvManualKmB = findViewById(R.id.tv_manual_km_b);
        tvManualAvgB = findViewById(R.id.tv_manual_avg_b);
        tvManualLitersB = findViewById(R.id.tv_manual_liters_b);
        btnEditLabelA = findViewById(R.id.btn_edit_label_a);
        btnEditLabelB = findViewById(R.id.btn_edit_label_b);
        btnResetManualTripA = findViewById(R.id.btn_reset_manual_trip_a);
        btnResetManualTripB = findViewById(R.id.btn_reset_manual_trip_b);
        btnResetManualTripA.setOnClickListener(v -> resetManualTripComputer(ManualTripComputer.SLOT_A));
        btnResetManualTripB.setOnClickListener(v -> resetManualTripComputer(ManualTripComputer.SLOT_B));
        btnEditLabelA.setOnClickListener(v -> showEditLabelDialog(ManualTripComputer.SLOT_A, tvManualLabelA));
        btnEditLabelB.setOnClickListener(v -> showEditLabelDialog(ManualTripComputer.SLOT_B, tvManualLabelB));
        if (tvGear.getBackground() != null) tvGear.setBackground(tvGear.getBackground().mutate());

        trackListContainer = findViewById(R.id.track_list_container);
        toggleAuto = findViewById(R.id.toggle_auto);
        toggleManual = findViewById(R.id.toggle_manual);
        btnEnterSelection = findViewById(R.id.btn_enter_selection);
        selectionBar = findViewById(R.id.selection_bar);
        tvSelectionCount = findViewById(R.id.tv_selection_count);
        btnCancelSelection = findViewById(R.id.btn_cancel_selection);
        btnDeleteSelected = findViewById(R.id.btn_delete_selected);

        // Pannello di dettaglio viaggio: un'unica istanza inflata una volta, ri-agganciata
        // sotto la riga espansa (vedi attachDetailPanelTo()). La MapView invece NON e'
        // condivisa (vedi showMapForTrip()): mapContainer e' solo il contenitore vuoto in
        // cui viene creata/distrutta una MapView nuova ad ogni apertura online.
        tripDetailPanel = getLayoutInflater().inflate(R.layout.view_trip_detail, null);
        mapContainer = tripDetailPanel.findViewById(R.id.map_container);
        tripTraceView = tripDetailPanel.findViewById(R.id.trip_trace_view);
        tvMapOfflineLabel = tripDetailPanel.findViewById(R.id.tv_map_offline_label);
        tvDetailKm = tripDetailPanel.findViewById(R.id.tv_detail_km);
        tvDetailLiters = tripDetailPanel.findViewById(R.id.tv_detail_liters);
        tvDetailAvg = tripDetailPanel.findViewById(R.id.tv_detail_avg);
        detailRouteCard = tripDetailPanel.findViewById(R.id.detail_route_card);
        rowDetailStart = tripDetailPanel.findViewById(R.id.row_detail_start);
        rowDetailDestination = tripDetailPanel.findViewById(R.id.row_detail_destination);
        tvDetailStartAddress = tripDetailPanel.findViewById(R.id.tv_detail_start_address);
        tvDetailDestinationAddress = tripDetailPanel.findViewById(R.id.tv_detail_destination_address);
        energyFlowBlocks = tripDetailPanel.findViewById(R.id.energy_flow_blocks);
        tvFlowPctEv = tripDetailPanel.findViewById(R.id.tv_flow_pct_ev);
        tvFlowPctSeries = tripDetailPanel.findViewById(R.id.tv_flow_pct_series);
        tvFlowPctParallel = tripDetailPanel.findViewById(R.id.tv_flow_pct_parallel);
        tvFlowPctCharge = tripDetailPanel.findViewById(R.id.tv_flow_pct_charge);
        tvFlowPctIdle = tripDetailPanel.findViewById(R.id.tv_flow_pct_idle);
        // I pallini prendono il colore fisso della rispettiva modalita' una volta sola
        // (non cambiano mai, solo la percentuale sotto si aggiorna ad ogni viaggio aperto).
        tintFlowDot(R.id.dot_flow_ev, EnergyFlowUtil.Bucket.EV);
        tintFlowDot(R.id.dot_flow_series, EnergyFlowUtil.Bucket.SERIES);
        tintFlowDot(R.id.dot_flow_parallel, EnergyFlowUtil.Bucket.PARALLEL);
        tintFlowDot(R.id.dot_flow_charge, EnergyFlowUtil.Bucket.CHR);
        tintFlowDot(R.id.dot_flow_idle, EnergyFlowUtil.Bucket.IDLE);
        btnExportDetail = tripDetailPanel.findViewById(R.id.btn_export_detail);

        toggleUnitKm = findViewById(R.id.toggle_unit_km);
        toggleUnitMi = findViewById(R.id.toggle_unit_mi);
        toggleUnitLiters = findViewById(R.id.toggle_unit_liters);
        toggleUnitGal = findViewById(R.id.toggle_unit_gal);
        toggleLangIt = findViewById(R.id.toggle_lang_it);
        toggleLangEn = findViewById(R.id.toggle_lang_en);
        switchGps = findViewById(R.id.switch_gps);
        switchDebugMode = findViewById(R.id.switch_debug_mode);
        tvAppVersion = findViewById(R.id.tv_app_version);
        tvVehicleVin = findViewById(R.id.tv_vehicle_vin);
        tvCloudStatus = findViewById(R.id.tv_cloud_status);
        tvCloudSubtitle = findViewById(R.id.tv_cloud_subtitle);
        btnCloudPair = findViewById(R.id.btn_cloud_pair);
        btnCloudUnpair = findViewById(R.id.btn_cloud_unpair);

        tvLog = findViewById(R.id.tv_log);
        scrollLog = findViewById(R.id.scroll_log);
        btnSaveLog = findViewById(R.id.btn_save_log);
        btnClearLog = findViewById(R.id.btn_clear_log);

        // Rileva se l'utente e' ancora "in fondo" al log dopo ogni scroll (manuale o
        // programmatico): un piccolo margine di tolleranza (pochi dp) invece di un
        // confronto esatto, perche' l'ultimo pixel di scroll disponibile puo' variare di
        // qualche unita' con testo monospace/wrap. Se non e' in fondo, l'utente sta
        // leggendo log piu' vecchi: sospendiamo l'auto-scroll finche' non ci torna da solo.
        scrollLog.setOnScrollChangeListener((v, scrollX, scrollY, oldScrollX, oldScrollY) -> {
            View child = scrollLog.getChildAt(0);
            if (child == null) return;
            int maxScroll = child.getHeight() - scrollLog.getHeight();
            logAutoScroll = scrollY >= maxScroll - (int) dp(4);
        });

        navDashboard.setOnClickListener(v -> showSection(0));
        navStorico.setOnClickListener(v -> showSection(1));
        navImpostazioni.setOnClickListener(v -> showSection(2));
        navLog.setOnClickListener(v -> showSection(3));
        btnSaveLog.setOnClickListener(v -> saveLogToUsb());
        btnClearLog.setOnClickListener(v -> confirmClearLog());
        toggleAuto.setOnClickListener(v -> {
            currentTrackFilter = TripRecord.TYPE_AUTO;
            expandedTripId = null;
            // Le selezioni sono id di UN filtro solo: cambiarlo senza uscire dalla
            // selezione rischierebbe di cancellare righe non piu' visibili.
            selectionMode = false;
            selectedTripIds.clear();
            refreshTrackList();
        });
        toggleManual.setOnClickListener(v -> {
            currentTrackFilter = TripRecord.TYPE_MANUAL;
            expandedTripId = null;
            selectionMode = false;
            selectedTripIds.clear();
            refreshTrackList();
        });
        btnEnterSelection.setOnClickListener(v -> {
            selectionMode = true;
            expandedTripId = null;
            refreshTrackList();
        });
        btnCancelSelection.setOnClickListener(v -> exitSelectionMode());
        btnDeleteSelected.setOnClickListener(v -> confirmDeleteSelectedTrips());
        showSection(0);
        setupImpostazioni();
        startLiveDotPulse();

        requestNeededPermissions();
        requestIgnoreBatteryOptimizations();
        ContextCompat.startForegroundService(this, new Intent(this, TrackingService.class));

        connectCar();
        connectVdbInfo();
        startTripConsumptionRefresh();
    }

    private void startLiveDotPulse() {
        ObjectAnimator anim = ObjectAnimator.ofFloat(liveDot, "alpha", 1f, 0.35f);
        anim.setDuration(1000);
        anim.setRepeatMode(ObjectAnimator.REVERSE);
        anim.setRepeatCount(ObjectAnimator.INFINITE);
        anim.start();
    }

    // Riduce (non elimina del tutto su alcuni ROM OEM) il rischio che il sistema uccida
    // il processo in background. Il fix principale per la sopravvivenza del service e'
    // android:stopWithTask="false" nel manifest.
    private void requestIgnoreBatteryOptimizations() {
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                appendLog("Richiedo esenzione ottimizzazione batteria");
                Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } else {
                appendLog("Esenzione ottimizzazione batteria: già concessa");
            }
        } catch (Exception e) {
            appendLog("Errore richiesta esenzione batteria: " + e);
        }
    }

    // TripConsumption e' calcolato da TrackingService (stesso processo, holder statico
    // condiviso) usando gli stessi trigger di apertura/chiusura della traccia GPS.
    // Qui ci limitiamo a rileggerlo periodicamente e aggiornare la card.
    private final android.os.Handler tripRefreshHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable tripRefreshRunnable = new Runnable() {
        @Override
        public void run() {
            renderTripConsumption();
            tripRefreshHandler.postDelayed(this, 3000);
        }
    };

    private void startTripConsumptionRefresh() {
        tripRefreshHandler.post(tripRefreshRunnable);
    }

    private static final int KEY_DRIVE_MODE = VDInfoClient.keyFor(VDInfoClient.MODULE_NEW_ENERGY, VDInfoClient.ID_DRIVE_MODE);
    private static final int KEY_DISPLAY_SOC = VDInfoClient.keyFor(VDInfoClient.MODULE_NEW_ENERGY, VDInfoClient.ID_DISPLAY_SOC);
    private static final int KEY_FUEL_PERCENT = VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_FUEL_PERCENT);
    private static final int KEY_ENERGY_FLOW = VDInfoClient.keyFor(VDInfoClient.MODULE_NEW_ENERGY, VDInfoClient.ID_ENERGY_FLOW);
    private static final int KEY_VIN = VDInfoClient.keyFor(VDInfoClient.MODULE_READONLY_INFO, VDInfoClient.ID_VIN);
    private static final int KEY_VIN_ALT = VDInfoClient.keyFor(VDInfoClient.MODULE_DOANOSE, VDInfoClient.ID_VIN_ALT);

    // Azzeramento irreversibile (il progresso accumulato dall'ultimo reset va perso, solo
    // archiviato nello Storico) - conferma esplicita prima di procedere, stesso pattern
    // gia' usato per la cancellazione multipla dallo Storico.
    private void resetManualTripComputer(String slot) {
        String label = ManualTripComputer.getLabel(this, slot);
        showConfirmDialog(
            getString(R.string.dialog_reset_trip_title, label),
            getString(R.string.dialog_reset_trip_message),
            getString(R.string.btn_reset),
            false,
            () -> doResetManualTripComputer(slot));
    }

    // Dialog di conferma generica in stile app (card scura, vedi dialog_confirm.xml)
    // invece del dialog di sistema chiaro/di default - riusata sia per il reset di un
    // trip manuale che per la cancellazione multipla dallo Storico. "danger" sceglie lo
    // sfondo del tasto positivo (btn_danger_bg per azioni distruttive vs btn_primary_bg).
    private void showConfirmDialog(String title, String message, String positiveLabel, boolean danger, Runnable onConfirm) {
        View view = getLayoutInflater().inflate(R.layout.dialog_confirm, null);
        TextView tvTitle = view.findViewById(R.id.tv_confirm_title);
        TextView tvMessage = view.findViewById(R.id.tv_confirm_message);
        TextView btnNegative = view.findViewById(R.id.btn_confirm_negative);
        TextView btnPositive = view.findViewById(R.id.btn_confirm_positive);

        tvTitle.setText(title);
        tvMessage.setText(message);
        btnNegative.setText(getString(R.string.dialog_btn_cancel));
        btnPositive.setText(positiveLabel);
        btnPositive.setBackgroundResource(danger ? R.drawable.btn_danger_bg : R.drawable.btn_primary_bg);
        btnPositive.setTextColor(ContextCompat.getColor(this, danger ? R.color.error : R.color.on_primary));

        androidx.appcompat.app.AlertDialog dialog = new androidx.appcompat.app.AlertDialog.Builder(this)
            .setView(view)
            .create();
        dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        btnNegative.setOnClickListener(v -> dialog.dismiss());
        btnPositive.setOnClickListener(v -> {
            dialog.dismiss();
            onConfirm.run();
        });
        dialog.show();
    }

    // Non serve piu' alcun dato VDB per resettare uno slot: km e litri sono ormai
    // accumulatori (vedi ManualTripComputer), il reset si limita ad azzerarli.
    private void doResetManualTripComputer(String slot) {
        ManualTripComputer.reset(this, slot);
        appendLog("Trip computer manuale " + slot + " azzerato");
        Toast.makeText(this, getString(R.string.toast_slot_reset, ManualTripComputer.getLabel(this, slot)), Toast.LENGTH_SHORT).show();
        renderTripConsumption();
        if (contentStorico.getVisibility() == View.VISIBLE) refreshTrackList();
    }

    // Etichetta personalizzata di uno slot (Trip A/Trip B): piccolo dialog con
    // EditText + tastiera, per dare un nome amichevole (es. "Casa-Lavoro").
    private void showEditLabelDialog(String slot, TextView labelView) {
        View view = getLayoutInflater().inflate(R.layout.dialog_rename, null);
        TextView tvTitle = view.findViewById(R.id.tv_rename_title);
        android.widget.EditText input = view.findViewById(R.id.et_rename_input);
        LinearLayout presetContainer = view.findViewById(R.id.preset_chip_container);
        TextView btnCancel = view.findViewById(R.id.btn_rename_cancel);
        TextView btnSave = view.findViewById(R.id.btn_rename_save);

        tvTitle.setText(getString(R.string.dialog_rename_title, ManualTripComputer.defaultLabel(this, slot)));
        input.setText(ManualTripComputer.getLabel(this, slot));
        input.setSelectAllOnFocus(true);

        androidx.appcompat.app.AlertDialog dialog = new androidx.appcompat.app.AlertDialog.Builder(this)
            .setView(view)
            .create();
        dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);

        // Tasti di preset predefiniti (traducibili, vedi R.array.preset_trip_names):
        // toccandone uno si compila subito il campo, senza salvare - l'utente conferma
        // comunque con SALVA, cosi' puo' ancora modificarlo prima di confermare.
        String[] presets = getResources().getStringArray(R.array.preset_trip_names);
        for (String preset : presets) {
            TextView chip = new TextView(this);
            chip.setText(preset);
            chip.setTextColor(ContextCompat.getColor(this, R.color.on_surface_variant));
            chip.setTextSize(16);
            chip.setBackgroundResource(R.drawable.badge_chip_neutral);
            int padH = (int) dp(14), padV = (int) dp(10);
            chip.setPadding(padH, padV, padH, padV);
            chip.setClickable(true);
            chip.setFocusable(true);
            LinearLayout.LayoutParams chipParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            chipParams.rightMargin = (int) dp(10);
            chip.setLayoutParams(chipParams);
            chip.setOnClickListener(v -> {
                input.setText(preset);
                input.setSelection(preset.length());
            });
            presetContainer.addView(chip);
        }

        btnCancel.setOnClickListener(v -> dialog.dismiss());
        btnSave.setOnClickListener(v -> {
            String newLabel = input.getText().toString().trim();
            if (newLabel.isEmpty()) newLabel = ManualTripComputer.defaultLabel(this, slot);
            ManualTripComputer.setLabel(this, slot, newLabel);
            labelView.setText(newLabel);
            dialog.dismiss();
        });
        dialog.show();
    }

    // --- Pairing cloud (associazione auto <-> account, vedi cloud/DESIGN.md §7) ---

    private androidx.appcompat.app.AlertDialog pairingDialog;
    private final android.os.Handler pairingHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private Runnable pairingPollRunnable;
    private int pairingPollErrorStreak = 0;

    private static final long PAIRING_POLL_INTERVAL_MS = 3000L;
    // Soglia di sicurezza per non restare a pollare all'infinito in caso di rete
    // genuinamente irraggiungibile (il codice scade comunque lato server dopo 10 minuti,
    // ma senza rete quella risposta non arriverebbe mai) - vedi pollPairingStatus().
    private static final int PAIRING_MAX_POLL_ERRORS = 20;

    private void showPairingDialog() {
        View root = getLayoutInflater().inflate(R.layout.dialog_pairing, null);
        pairingDialog = new androidx.appcompat.app.AlertDialog.Builder(this).setView(root).create();
        pairingDialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        pairingDialog.setOnDismissListener(d -> stopPairingPolling());

        android.widget.EditText etVin = root.findViewById(R.id.et_pairing_vin);
        TextView btnVinContinue = root.findViewById(R.id.btn_pairing_vin_continue);
        TextView btnRetry = root.findViewById(R.id.btn_pairing_retry);
        TextView btnClose = root.findViewById(R.id.btn_pairing_close);

        btnVinContinue.setOnClickListener(v -> {
            String vin = etVin.getText().toString().trim().toUpperCase(Locale.US);
            if (vin.length() < 5) {
                Toast.makeText(this, getString(R.string.dialog_pairing_error_vin_too_short), Toast.LENGTH_SHORT).show();
                return;
            }
            startPairing(root, vin);
        });
        btnRetry.setOnClickListener(v -> resetPairingFlow(root));
        btnClose.setOnClickListener(v -> pairingDialog.dismiss());

        resetPairingFlow(root);
        pairingDialog.show();
    }

    // Punto di ingresso/reset del flusso: se il VIN e' gia' noto (una delle 3 fonti VDB/
    // CarPropertyManager gia' provate all'avvio, vedi tryReadStandardVin()) lo usa subito,
    // altrimenti mostra il campo di inserimento manuale - fallback previsto fin dal design
    // (cloud/DESIGN.md §15) dato che l'affidabilita' della lettura automatica non e' garantita.
    private void resetPairingFlow(View root) {
        stopPairingPolling();
        setPairingSection(root, "vin_or_status");
        String knownVin = vinResolved ? tvVehicleVin.getText().toString().trim() : null;
        if (knownVin != null && !knownVin.isEmpty()) {
            startPairing(root, knownVin);
        } else {
            setPairingSection(root, "vin");
        }
    }

    private void startPairing(View root, String vin) {
        setPairingSection(root, "status");
        TextView tvStatusMessage = root.findViewById(R.id.tv_pairing_status_message);
        tvStatusMessage.setText(getString(R.string.dialog_pairing_starting));

        String versionName = "?";
        try {
            versionName = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) {
        }
        String finalVersionName = versionName;

        new Thread(() -> {
            try {
                CloudApiClient.PairingStart result = CloudApiClient.pairingStart(vin, finalVersionName);
                runOnUiThread(() -> showPairingCode(root, result));
            } catch (Exception e) {
                appendLog("[Cloud] Errore avvio pairing: " + e);
                runOnUiThread(() -> showPairingError(root, getString(R.string.dialog_pairing_error_network)));
            }
        }, "JaeDrive-PairingStart").start();
    }

    private void showPairingCode(View root, CloudApiClient.PairingStart result) {
        if (pairingDialog == null || !pairingDialog.isShowing()) return;
        setPairingSection(root, "code");
        TextView tvCode = root.findViewById(R.id.tv_pairing_code);
        ImageView ivQr = root.findViewById(R.id.iv_pairing_qr);
        tvCode.setText(result.code);

        String qrContent = "https://jaedrive.com/pair?code=" + result.code;
        new Thread(() -> {
            Bitmap qr = QrCodeUtil.encode(qrContent, (int) dp(220));
            runOnUiThread(() -> {
                if (qr != null) ivQr.setImageBitmap(qr);
            });
        }, "JaeDrive-QrGen").start();

        pairingPollErrorStreak = 0;
        pollPairingStatus(root, result.pairingRequestId);
    }

    private void pollPairingStatus(View root, String pairingRequestId) {
        pairingPollRunnable = () -> new Thread(() -> {
            try {
                CloudApiClient.PairingStatus status = CloudApiClient.pairingStatus(pairingRequestId);
                pairingPollErrorStreak = 0;
                if ("claimed".equals(status.status) && status.deviceToken != null) {
                    runOnUiThread(() -> finishPairingSuccess(root, status.deviceToken));
                } else if ("expired".equals(status.status)) {
                    runOnUiThread(() -> showPairingError(root, getString(R.string.dialog_pairing_error_expired)));
                } else {
                    // "pending" (o "claimed" ma senza token, gia' consegnato in un poll
                    // precedente - non dovrebbe succedere in questo flusso, trattato come
                    // pending): richiama se stesso dopo l'intervallo.
                    pairingHandler.postDelayed(pairingPollRunnable, PAIRING_POLL_INTERVAL_MS);
                }
            } catch (Exception e) {
                pairingPollErrorStreak++;
                if (pairingPollErrorStreak >= PAIRING_MAX_POLL_ERRORS) {
                    appendLog("[Cloud] Troppi errori di rete durante il polling pairing, interrotto: " + e);
                    runOnUiThread(() -> showPairingError(root, getString(R.string.dialog_pairing_error_network)));
                } else {
                    pairingHandler.postDelayed(pairingPollRunnable, PAIRING_POLL_INTERVAL_MS);
                }
            }
        }, "JaeDrive-PairingPoll").start();
        pairingHandler.postDelayed(pairingPollRunnable, PAIRING_POLL_INTERVAL_MS);
    }

    private void stopPairingPolling() {
        if (pairingPollRunnable != null) {
            pairingHandler.removeCallbacks(pairingPollRunnable);
            pairingPollRunnable = null;
        }
    }

    private void finishPairingSuccess(View root, String deviceToken) {
        stopPairingPolling();
        Prefs.setCloudPairing(this, deviceToken, null);
        refreshCloudSection();
        SyncScheduler.enqueueSync(this); // eventuali trip gia' in attesa partono subito
        appendLog("[Cloud] Auto associata all'account");

        setPairingSection(root, "status");
        TextView tvStatusMessage = root.findViewById(R.id.tv_pairing_status_message);
        tvStatusMessage.setText(getString(R.string.dialog_pairing_success));
        // Chiusura automatica dopo una breve pausa, cosi' l'utente vede la conferma invece
        // di sparire istantaneamente.
        pairingHandler.postDelayed(() -> {
            if (pairingDialog != null && pairingDialog.isShowing()) pairingDialog.dismiss();
        }, 1500L);
    }

    private void showPairingError(View root, String message) {
        stopPairingPolling();
        setPairingSection(root, "error");
        TextView tvError = root.findViewById(R.id.tv_pairing_error);
        tvError.setText(message);
    }

    // Mostra UNA sola sezione del dialogo per volta (vedi dialog_pairing.xml): "vin",
    // "status", "code", "error", oppure "vin_or_status" per nascondere tutto durante la
    // decisione iniziale in resetPairingFlow() (evita un fotogramma con piu' sezioni
    // visibili insieme mentre si decide quale mostrare).
    private void setPairingSection(View root, String section) {
        root.findViewById(R.id.section_pairing_vin).setVisibility("vin".equals(section) ? View.VISIBLE : View.GONE);
        root.findViewById(R.id.section_pairing_status).setVisibility("status".equals(section) ? View.VISIBLE : View.GONE);
        root.findViewById(R.id.section_pairing_code).setVisibility("code".equals(section) ? View.VISIBLE : View.GONE);
        root.findViewById(R.id.section_pairing_error).setVisibility("error".equals(section) ? View.VISIBLE : View.GONE);
    }

    private void renderTripConsumption() {
        // ULTIMO VIAGGIO (auto, trigger marcia): live se in corso, congelato se concluso.
        double kmDelta;
        Double liters;
        Double avg;
        boolean live = TripConsumption.isActive(this);
        if (live) {
            kmDelta = TripConsumption.getKmDelta(this);
            liters = TripConsumption.getLitersDelta(this);
            avg = TripConsumption.computeAverage(this);
        } else {
            kmDelta = TripConsumption.getLastKmDelta(this);
            liters = TripConsumption.getLastLiters(this);
            avg = TripConsumption.getLastAverage(this);
        }
        boolean hasData = kmDelta > 0 || liters != null;
        tvTripStatusBadge.setText(live ? getString(R.string.trip_status_ongoing)
            : (hasData ? getString(R.string.trip_status_ended) : getString(R.string.trip_status_none)));
        tvTripStatusBadge.setBackgroundResource(live ? R.drawable.badge_chip_primary : R.drawable.badge_chip_neutral);
        tvTripStatusBadge.setTextColor(ContextCompat.getColor(this, live ? R.color.primary : R.color.on_surface_variant));
        tvTripKm.setText(UnitFormatter.formatDistance(this, kmDelta));
        tvTripLiters.setText(liters != null ? UnitFormatter.formatLiters(this, liters) : "— L");
        tvTripAvg.setText(avg != null ? UnitFormatter.formatConsumption(this, avg) : "— km/l");
        updateConsumptionTrendColor(avg, live);

        // TRIP COMPUTER MANUALI (A/B): sempre live, ciascuno accumula indipendentemente
        // dal proprio ultimo reset. Icona+valore per riga invece di un blocco di testo,
        // piu' leggibile a colpo d'occhio sullo schermo compatto.
        tvManualLabelA.setText(ManualTripComputer.getLabel(this, ManualTripComputer.SLOT_A));
        tvManualLabelB.setText(ManualTripComputer.getLabel(this, ManualTripComputer.SLOT_B));
        renderManualSlot(ManualTripComputer.SLOT_A, tvManualKmA, tvManualAvgA, tvManualLitersA);
        renderManualSlot(ManualTripComputer.SLOT_B, tvManualKmB, tvManualAvgB, tvManualLitersB);
    }

    // Confronta il consumo medio col valore dell'ultimo aggiornamento (~3s prima, vedi
    // tripRefreshRunnable): bordo verde se sta migliorando, arancio/rosso se peggiora (di
    // piu' o di meno). Soglie di prima approssimazione, da tarare con dati reali su strada.
    private static final double TREND_IMPROVING = 0.02;
    private static final double TREND_WORSENING_MILD = -0.02;
    private static final double TREND_WORSENING_STRONG = -0.15;

    private void updateConsumptionTrendColor(Double avg, boolean live) {
        if (!live || avg == null) {
            cardTripAvg.setBackgroundResource(R.drawable.card_bg);
            lastTripAvgForTrend = avg;
            return;
        }
        if (lastTripAvgForTrend != null) {
            double delta = avg - lastTripAvgForTrend;
            Integer color = null;
            if (delta >= TREND_IMPROVING) {
                color = ContextCompat.getColor(this, R.color.trend_positive);
            } else if (delta <= TREND_WORSENING_STRONG) {
                color = ContextCompat.getColor(this, R.color.trend_negative);
            } else if (delta <= TREND_WORSENING_MILD) {
                color = ContextCompat.getColor(this, R.color.trend_warning);
            }
            if (color != null) {
                cardTripAvg.setBackgroundResource(R.drawable.card_bg);
                android.graphics.drawable.Drawable bg = cardTripAvg.getBackground().mutate();
                cardTripAvg.setBackground(bg);
                if (bg instanceof android.graphics.drawable.GradientDrawable) {
                    ((android.graphics.drawable.GradientDrawable) bg).setStroke((int) dp(1.5f), color);
                }
            } else {
                cardTripAvg.setBackgroundResource(R.drawable.card_bg);
            }
        }
        lastTripAvgForTrend = avg;
    }

    private void renderManualSlot(String slot, TextView kmView, TextView avgView, TextView litersView) {
        double kmDelta = ManualTripComputer.getKmDelta(this, slot);
        Double liters = ManualTripComputer.getLitersDelta(this, slot);
        Double avg = ManualTripComputer.computeAverage(this, slot);
        kmView.setText(UnitFormatter.formatDistance(this, kmDelta));
        avgView.setText(avg != null ? UnitFormatter.formatConsumption(this, avg) : "—");
        litersView.setText(liters != null ? UnitFormatter.formatLiters(this, liters) : "—");
    }

    // Permessi per il tracciamento GPS in background (TrackingService).
    private static final int REQUEST_CODE_PERMISSIONS = 2001;

    private void requestNeededPermissions() {
        List<String> toRequest = new ArrayList<>();

        boolean locGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        appendLog("Permesso ACCESS_FINE_LOCATION: " + (locGranted ? "già concesso" : "da richiedere"));
        if (!locGranted) toRequest.add(Manifest.permission.ACCESS_FINE_LOCATION);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean notifGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
            appendLog("Permesso POST_NOTIFICATIONS: " + (notifGranted ? "già concesso" : "da richiedere"));
            if (!notifGranted) toRequest.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (!toRequest.isEmpty()) {
            appendLog("Richiedo permessi runtime: " + toRequest);
            ActivityCompat.requestPermissions(this, toRequest.toArray(new String[0]), REQUEST_CODE_PERMISSIONS);
        } else {
            appendLog("Nessun permesso runtime da richiedere");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_CODE_PERMISSIONS) return;
        for (int i = 0; i < permissions.length; i++) {
            boolean granted = grantResults[i] == PackageManager.PERMISSION_GRANTED;
            appendLog("Esito permesso " + permissions[i] + ": " + (granted ? "CONCESSO" : "NEGATO"));
        }
    }

    // index: 0 = Dashboard, 1 = Storico, 2 = Impostazioni, 3 = Log
    private void showSection(int index) {
        contentDashboard.setVisibility(index == 0 ? View.VISIBLE : View.GONE);
        contentStorico.setVisibility(index == 1 ? View.VISIBLE : View.GONE);
        contentImpostazioni.setVisibility(index == 2 ? View.VISIBLE : View.GONE);
        contentLog.setVisibility(index == 3 ? View.VISIBLE : View.GONE);

        styleNavItem(navDashboard, iconNavDashboard, labelNavDashboard, index == 0);
        styleNavItem(navStorico, iconNavStorico, labelNavStorico, index == 1);
        styleNavItem(navImpostazioni, iconNavImpostazioni, labelNavImpostazioni, index == 2);
        styleNavItem(navLog, iconNavLog, labelNavLog, index == 3);

        if (index == 1) refreshTrackList();
        if (index == 3) renderLogView();
    }

    private void styleNavItem(View container, ImageView icon, TextView label, boolean active) {
        container.setBackground(active ? ContextCompat.getDrawable(this, R.drawable.nav_item_active_bg) : null);
        int color = ContextCompat.getColor(this, active ? R.color.primary : R.color.on_surface_variant);
        icon.setColorFilter(color);
        label.setTextColor(color);
    }

    // Elenca i viaggi salvati in TripDatabase (automatici GPS o manuali a seconda del
    // toggle selezionato), piu' recenti prima. Ogni riga si espande in verticale
    // (accordion): il pannello condiviso viene ri-agganciato sotto la riga aperta.
    // Per i MANUALI, in testa ai due record A/B ancora aperti (mai chiusi in
    // TripDatabase finche' non vengono resettati) - costruiti al volo dall'accumulatore
    // corrente, non persistiti: si aggiornano semplicemente ogni volta che questa lista
    // viene ridisegnata (cambio tab/filtro/reset), non serve un refresh dedicato.
    private void refreshTrackList() {
        styleToggle(toggleAuto, TripRecord.TYPE_AUTO.equals(currentTrackFilter));
        styleToggle(toggleManual, TripRecord.TYPE_MANUAL.equals(currentTrackFilter));

        btnEnterSelection.setVisibility(selectionMode ? View.GONE : View.VISIBLE);
        selectionBar.setVisibility(selectionMode ? View.VISIBLE : View.GONE);
        tvSelectionCount.setText(getString(R.string.label_selected_count, selectedTripIds.size()));

        trackListContainer.removeAllViews();
        currentTripsById.clear();
        List<TripRecord> trips = new ArrayList<>();
        if (TripRecord.TYPE_MANUAL.equals(currentTrackFilter)) {
            trips.add(buildOngoingManualRecord(ManualTripComputer.SLOT_A, -1));
            trips.add(buildOngoingManualRecord(ManualTripComputer.SLOT_B, -2));
        }
        trips.addAll(TripDatabase.getInstance(this).getTrips(currentTrackFilter));
        for (TripRecord r : trips) {
            if (!r.ongoing) currentTripsById.put(r.id, r);
        }
        if (trips.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText(TripRecord.TYPE_AUTO.equals(currentTrackFilter)
                ? getString(R.string.empty_auto_trips) : getString(R.string.empty_manual_trips));
            empty.setTextColor(ContextCompat.getColor(this, R.color.on_surface_variant));
            empty.setTextSize(28);
            trackListContainer.addView(empty);
            return;
        }

        for (TripRecord r : trips) {
            trackListContainer.addView(buildTripRow(r));
        }
    }

    private void exitSelectionMode() {
        selectionMode = false;
        selectedTripIds.clear();
        refreshTrackList();
    }

    // Cancellazione irreversibile: conferma esplicita prima di procedere. Elimina anche
    // gpx/log su disco per i trip AUTO selezionati (path noti solo qui, letti dalla cache
    // currentTripsById popolata dall'ultimo refreshTrackList()), non solo la riga in TripDatabase.
    private void confirmDeleteSelectedTrips() {
        if (selectedTripIds.isEmpty()) return;
        showConfirmDialog(
            getString(R.string.dialog_delete_trips_title),
            getString(R.string.dialog_delete_trips_message),
            getString(R.string.btn_delete),
            true,
            this::deleteSelectedTrips);
    }

    private void deleteSelectedTrips() {
        List<Long> ids = new ArrayList<>(selectedTripIds);
        for (Long id : ids) {
            TripRecord r = currentTripsById.get(id);
            if (r == null) continue;
            if (r.gpxPath != null) {
                File f = new File(r.gpxPath);
                if (f.exists()) f.delete();
            }
            if (r.logPath != null) {
                File f = new File(r.logPath);
                if (f.exists()) f.delete();
            }
        }
        TripDatabase.getInstance(this).deleteTrips(ids);
        appendLog(ids.size() + " viaggi eliminati dallo Storico");
        exitSelectionMode();
    }

    // Record "virtuale" (non persistito) per il periodo ancora aperto di uno slot
    // manuale, dall'ultimo reset ad ora - vedi refreshTrackList(). id e' un sentinel
    // negativo (-1/-2), mai in conflitto con gli id reali di TripDatabase (AUTOINCREMENT
    // parte da 1).
    private TripRecord buildOngoingManualRecord(String slot, long idSentinel) {
        TripRecord r = new TripRecord();
        r.id = idSentinel;
        r.type = TripRecord.TYPE_MANUAL;
        r.ongoing = true;
        r.startTime = ManualTripComputer.getResetTime(this, slot);
        r.endTime = System.currentTimeMillis();
        r.kmDelta = ManualTripComputer.getKmDelta(this, slot);
        r.litersDelta = ManualTripComputer.getLitersDelta(this, slot);
        r.avgConsumption = ManualTripComputer.computeAverage(this, slot);
        r.label = ManualTripComputer.getLabel(this, slot);
        return r;
    }

    private void styleToggle(TextView t, boolean active) {
        if (active) {
            t.setBackgroundResource(R.drawable.segment_selected_bg);
            t.setTextColor(ContextCompat.getColor(this, R.color.on_primary));
        } else {
            t.setBackground(null);
            t.setTextColor(ContextCompat.getColor(this, R.color.on_surface_variant));
        }
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }

    // Riga della lista: header cliccabile (data/ora + statistiche compatte + freccia) e,
    // se espansa, uno slot dove viene agganciato il pannello di dettaglio condiviso. In
    // modalita' selezione la riga non si espande piu' (tap = seleziona/deseleziona) e la
    // freccia e' sostituita da un indicatore di selezione - i due record "ongoing"
    // virtuali (id negativo, non persistiti) non sono mai selezionabili/cancellabili.
    private View buildTripRow(TripRecord r) {
        boolean selectable = !r.ongoing;
        boolean selected = selectionMode && selectable && selectedTripIds.contains(r.id);
        boolean expanded = !selectionMode && expandedTripId != null && expandedTripId == r.id;

        LinearLayout outer = new LinearLayout(this);
        outer.setOrientation(LinearLayout.VERTICAL);
        outer.setBackgroundResource((expanded || selected) ? R.drawable.glass_card_glow_bg : R.drawable.card_bg);
        LinearLayout.LayoutParams outerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        outerParams.bottomMargin = (int) dp(12);
        outer.setLayoutParams(outerParams);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(android.view.Gravity.CENTER_VERTICAL);
        int pad = (int) dp(20);
        header.setPadding(pad, pad, pad, pad);
        header.setClickable(true);
        header.setFocusable(true);
        header.setOnClickListener(v -> {
            if (selectionMode) {
                if (!selectable) return;
                if (selected) selectedTripIds.remove(r.id); else selectedTripIds.add(r.id);
                refreshTrackList();
            } else {
                expandedTripId = expanded ? null : r.id;
                refreshTrackList();
            }
        });
        header.setOnLongClickListener(v -> {
            if (!selectable) return false;
            selectionMode = true;
            expandedTripId = null;
            selectedTripIds.add(r.id);
            refreshTrackList();
            return true;
        });

        LinearLayout textCol = new LinearLayout(this);
        textCol.setOrientation(LinearLayout.VERTICAL);
        textCol.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        // Se presente un'etichetta (indirizzo di destinazione per gli AUTO, nome dello
        // slot per i MANUAL) la mostriamo come titolo principale della riga, con la
        // data/ora come sottotitolo - altrimenti la data/ora resta l'unico titolo.
        boolean hasLabel = r.label != null && !r.label.isEmpty();
        if (hasLabel) {
            LinearLayout titleRow = new LinearLayout(this);
            titleRow.setOrientation(LinearLayout.HORIZONTAL);
            titleRow.setGravity(android.view.Gravity.CENTER_VERTICAL);

            TextView title = new TextView(this);
            title.setText(r.label);
            title.setTextColor(ContextCompat.getColor(this, R.color.on_surface));
            title.setTextSize(24);
            title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
            title.setMaxLines(1);
            title.setEllipsize(android.text.TextUtils.TruncateAt.END);
            title.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
            titleRow.addView(title);

            // Trip manuale non ancora resettato: ancora "aperto", non e' un viaggio
            // concluso come gli altri in questa lista - reso visibile con lo stesso
            // badge/colore usato per il viaggio automatico in corso sulla Dashboard.
            if (r.ongoing) {
                TextView badge = new TextView(this);
                badge.setText(getString(R.string.trip_status_ongoing));
                badge.setTextColor(ContextCompat.getColor(this, R.color.primary));
                badge.setTextSize(14);
                badge.setTypeface(badge.getTypeface(), android.graphics.Typeface.BOLD);
                badge.setBackgroundResource(R.drawable.badge_chip_primary);
                int bp = (int) dp(9);
                badge.setPadding(bp, (int) dp(3), bp, (int) dp(3));
                LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                badgeParams.leftMargin = (int) dp(8);
                badge.setLayoutParams(badgeParams);
                titleRow.addView(badge);
            }

            textCol.addView(titleRow);
        }

        TextView range = new TextView(this);
        range.setText(formatTripTimeRange(r));
        range.setTextColor(ContextCompat.getColor(this, expanded ? R.color.primary : R.color.on_surface_variant));
        range.setTextSize(hasLabel ? 18 : 20);
        if (!hasLabel) range.setTypeface(range.getTypeface(), android.graphics.Typeface.BOLD);

        LinearLayout stats = buildTripRowStatsRow(r);
        LinearLayout.LayoutParams statsParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        statsParams.topMargin = (int) dp(6);
        stats.setLayoutParams(statsParams);

        textCol.addView(range);
        textCol.addView(stats);

        if (selectionMode && selectable) {
            // Indicatore di selezione: classico checkbox quadrato con segno di spunta -
            // stesso ruolo della freccia espandi/comprimi in modalita' normale, ma per
            // la selezione (piu' chiaro di un semplice pallino pieno/vuoto).
            TextView selectIndicator = new TextView(this);
            int indicatorSize = (int) dp(28);
            LinearLayout.LayoutParams indicatorParams = new LinearLayout.LayoutParams(indicatorSize, indicatorSize);
            indicatorParams.leftMargin = (int) dp(16);
            selectIndicator.setLayoutParams(indicatorParams);
            selectIndicator.setGravity(android.view.Gravity.CENTER);
            selectIndicator.setText(selected ? "✓" : "");
            selectIndicator.setTextColor(ContextCompat.getColor(this, R.color.on_primary));
            selectIndicator.setTextSize(18);
            selectIndicator.setTypeface(selectIndicator.getTypeface(), android.graphics.Typeface.BOLD);
            selectIndicator.setBackgroundResource(selected ? R.drawable.checkbox_checked_bg : R.drawable.checkbox_unchecked_bg);
            header.addView(textCol);
            header.addView(selectIndicator);
        } else if (!selectionMode) {
            TextView chevron = new TextView(this);
            chevron.setText(expanded ? "▲" : "▼");
            chevron.setTextColor(ContextCompat.getColor(this, R.color.on_surface_variant));
            chevron.setTextSize(22);
            chevron.setPadding((int) dp(16), 0, 0, 0);
            header.addView(textCol);
            header.addView(chevron);
        } else {
            // Selection mode, ma questa riga (ongoing) non e' selezionabile: nessun
            // indicatore, solo il testo.
            header.addView(textCol);
        }
        outer.addView(header);

        if (selectionMode) {
            return outer;
        }

        FrameLayout detailSlot = new FrameLayout(this);
        LinearLayout.LayoutParams slotParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        slotParams.leftMargin = pad;
        slotParams.rightMargin = pad;
        slotParams.bottomMargin = pad;
        detailSlot.setLayoutParams(slotParams);
        outer.addView(detailSlot);

        if (expanded) {
            attachDetailPanelTo(detailSlot, r);
        }

        return outer;
    }

    // Il pannello di dettaglio (mappa/statistiche/export) e' UN'unica istanza: va
    // staccata dal suo parent precedente (una riga ormai ricostruita da refreshTrackList)
    // prima di riagganciarla nella nuova posizione, altrimenti Android lancia
    // "specified child already has a parent".
    private void attachDetailPanelTo(FrameLayout slot, TripRecord r) {
        ViewGroup currentParent = (ViewGroup) tripDetailPanel.getParent();
        if (currentParent != null) currentParent.removeView(tripDetailPanel);
        slot.addView(tripDetailPanel);
        renderTripDetail(r);
    }

    // Riga statistiche del trip nello Storico (versione compatta): stesse icone usate
    // nelle sotto-card della Dashboard (ic_location=km, ic_fuel=litri, ic_eco=media), per
    // coerenza visiva invece del semplice testo con separatori "·".
    private LinearLayout buildTripRowStatsRow(TripRecord r) {
        String kmStr = UnitFormatter.formatDistance(this, r.kmDelta);
        String litersStr = r.litersDelta != null ? UnitFormatter.formatLiters(this, r.litersDelta) : "— L";
        String avgStr = r.avgConsumption != null ? UnitFormatter.formatConsumption(this, r.avgConsumption) : "— km/l";

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(android.view.Gravity.CENTER_VERTICAL);
        row.addView(buildStatIconText(R.drawable.ic_location, kmStr, 0));
        row.addView(buildStatIconText(R.drawable.ic_fuel, litersStr, (int) dp(18)));
        row.addView(buildStatIconText(R.drawable.ic_eco, avgStr, (int) dp(18)));
        // Stato sincronizzazione cloud: solo icona (nessuna etichetta), verde se gia'
        // caricato, grigio (stesso colore delle altre icone) se ancora in coda - non e'
        // un errore, SyncWorker riprova automaticamente in background. Non mostrata per i
        // record "virtuali" (trip manuali ancora aperti, mai esistiti in TripDatabase).
        if (!r.ongoing) {
            int cloudColor = r.uploaded
                ? ContextCompat.getColor(this, R.color.trend_positive)
                : ContextCompat.getColor(this, R.color.on_surface_variant);
            row.addView(buildStatIconText(R.drawable.ic_cloud, "", (int) dp(18), cloudColor));
        }
        return row;
    }

    private LinearLayout buildStatIconText(int iconRes, String text, int startMargin) {
        return buildStatIconText(iconRes, text, startMargin, ContextCompat.getColor(this, R.color.on_surface_variant));
    }

    private LinearLayout buildStatIconText(int iconRes, String text, int startMargin, int iconColor) {
        LinearLayout group = new LinearLayout(this);
        group.setOrientation(LinearLayout.HORIZONTAL);
        group.setGravity(android.view.Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams groupParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        groupParams.leftMargin = startMargin;
        group.setLayoutParams(groupParams);

        ImageView icon = new ImageView(this);
        int iconSize = (int) dp(18);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(iconSize, iconSize);
        iconParams.rightMargin = (int) dp(5);
        icon.setLayoutParams(iconParams);
        icon.setImageResource(iconRes);
        icon.setColorFilter(iconColor);
        group.addView(icon);

        if (!text.isEmpty()) {
            TextView label = new TextView(this);
            label.setText(text);
            label.setTextColor(ContextCompat.getColor(this, R.color.on_surface));
            label.setTextSize(20);
            group.addView(label);
        }

        return group;
    }

    private String formatTripTimeRange(TripRecord r) {
        String startStr = DateFormat.format("dd/MM HH:mm", r.startTime).toString();
        // Aperto (mai resettato): non ha un vero orario di fine, "endTime" e' solo il
        // momento in cui questa riga e' stata disegnata - mostrare quello confonderebbe
        // con un viaggio davvero concluso in quel preciso istante.
        if (r.ongoing) {
            return getString(R.string.label_since) + " " + startStr;
        }
        boolean sameDay = DateFormat.format("dd/MM", r.startTime).toString()
            .equals(DateFormat.format("dd/MM", r.endTime).toString());
        String endStr = sameDay
            ? DateFormat.format("HH:mm", r.endTime).toString()
            : DateFormat.format("dd/MM HH:mm", r.endTime).toString();
        return startStr + " → " + endStr;
    }

    // Popola il pannello condiviso per il viaggio espanso: statistiche, export, e mappa
    // (OpenStreetMap reale se c'e' connessione internet, altrimenti la traccia
    // schematica offline gia' disegnata da TripTraceView a partire dagli stessi punti).
    private void renderTripDetail(TripRecord r) {
        tvDetailKm.setText(UnitFormatter.formatDistance(this, r.kmDelta));
        tvDetailLiters.setText(r.litersDelta != null ? UnitFormatter.formatLiters(this, r.litersDelta) : "—");
        tvDetailAvg.setText(r.avgConsumption != null ? UnitFormatter.formatConsumption(this, r.avgConsumption) : "—");
        btnExportDetail.setOnClickListener(v -> exportTripRecord(r));

        // Indirizzi partenza/destinazione (solo AUTO, solo se geocodificati con successo
        // a fine viaggio - vedi TrackingService.saveTripRecordAsync()) - la card intera
        // resta nascosta se non c'e' nessuno dei due, ogni riga singolarmente se manca
        // solo quello specifico indirizzo.
        boolean hasStart = r.startLabel != null && !r.startLabel.isEmpty();
        boolean hasDestination = r.label != null && !r.label.isEmpty();
        detailRouteCard.setVisibility((hasStart || hasDestination) ? View.VISIBLE : View.GONE);
        rowDetailStart.setVisibility(hasStart ? View.VISIBLE : View.GONE);
        rowDetailDestination.setVisibility(hasDestination ? View.VISIBLE : View.GONE);
        if (hasStart) tvDetailStartAddress.setText(r.startLabel);
        if (hasDestination) tvDetailDestinationAddress.setText(r.label);

        List<TripPoint> points = r.gpxPath != null ? GpxReader.readPoints(new File(r.gpxPath)) : new ArrayList<>();
        boolean online = NetUtils.hasInternet(this);
        tvMapOfflineLabel.setVisibility(online ? View.GONE : View.VISIBLE);
        mapContainer.setVisibility(online ? View.VISIBLE : View.GONE);
        tripTraceView.setVisibility(online ? View.GONE : View.VISIBLE);

        if (online) {
            showMapForTrip(points);
        } else {
            destroyMapView();
            tripTraceView.setPoints(points);
        }
        updateEnergyFlowBreakdown(points);
    }

    // Una MapView NUOVA ad ogni apertura online, invece di riusare la stessa istanza tra
    // un trip e l'altro (comportamento precedente): dopo un primo tentativo con solo
    // mapView.onResume() rivelatosi insufficiente, la causa e' che osmdroid chiude per
    // sempre i thread di download tile quando la View viene staccata dalla finestra
    // (onDetachedFromWindow() chiama TileProvider.detach(), non recuperabile con un
    // semplice onResume() successivo) - qui la vecchia istanza viene smontata/rilasciata
    // e se ne crea una fresca dentro mapContainer, che riparte sempre pulita.
    private void showMapForTrip(List<TripPoint> points) {
        destroyMapView();
        mapView = new MapView(this);
        mapView.setTileSource(TileSourceFactory.MAPNIK);
        mapView.setMultiTouchControls(true);
        mapContainer.addView(mapView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        mapView.onResume();
        showOnMap(points);
    }

    // Puo' essere chiamata anche su una MapView il cui detach e' gia' avvenuto
    // implicitamente (es. si e' semplicemente compresso l'accordion e refreshTrackList()
    // ha ricostruito la riga, staccando l'intero sottoalbero dalla finestra da sola) -
    // try/catch difensivo per non rischiare un crash su un doppio detach.
    private void destroyMapView() {
        if (mapView == null) return;
        try {
            mapView.onPause();
            mapView.onDetach();
        } catch (Exception ignored) {
        }
        mapContainer.removeAllViews();
        mapView = null;
    }

    // Disegna la traccia sulla mappa OSM reale come tanti piccoli segmenti colorati (invece
    // di un'unica Polyline monocolore) in base all'ENERGY_FLOW campionato in ogni punto -
    // stessa logica/colori di TripTraceView.EnergyFlowUtil, cosi' online e offline
    // raccontano la stessa storia.
    private void showOnMap(List<TripPoint> points) {
        mapView.getOverlays().clear();
        if (points.size() < 2) {
            mapView.invalidate();
            return;
        }
        List<GeoPoint> geoPoints = new ArrayList<>(points.size());
        for (TripPoint p : points) geoPoints.add(new GeoPoint(p.lat, p.lon));

        for (int i = 0; i < points.size() - 1; i++) {
            Polyline segment = new Polyline();
            segment.setPoints(java.util.Arrays.asList(geoPoints.get(i), geoPoints.get(i + 1)));
            int color = EnergyFlowUtil.colorFor(points.get(i).energyFlow);
            segment.getOutlinePaint().setColor(color);
            segment.getOutlinePaint().setStrokeWidth(dp(4));
            mapView.getOverlays().add(segment);
        }
        mapView.invalidate();

        BoundingBox box = BoundingBox.fromGeoPoints(geoPoints);
        // Il bounding box va applicato dopo che la MapView ha una dimensione nota (layout gia' fatto).
        mapView.post(() -> mapView.zoomToBoundingBox(box, false, (int) dp(24)));
    }

    // Percentuali EV/serie/parallelo/ricarica/idle dell'intero viaggio, calcolate
    // contando i campioni ENERGY_FLOW salvati per punto (non e' un vero calcolo pesato
    // sul tempo/km, ma una buona approssimazione dato il campionamento ~regolare ogni
    // punto GPS).
    private void updateEnergyFlowBreakdown(List<TripPoint> points) {
        int ev = 0, series = 0, parallel = 0, chr = 0, idle = 0, known = 0;
        for (TripPoint p : points) {
            if (p.energyFlow < 0) continue;
            known++;
            switch (EnergyFlowUtil.bucketFor(p.energyFlow)) {
                case EV: ev++; break;
                case SERIES: series++; break;
                case PARALLEL: parallel++; break;
                case CHR: chr++; break;
                default: idle++; break;
            }
        }
        if (known == 0) {
            energyFlowBlocks.setVisibility(View.GONE);
            return;
        }
        energyFlowBlocks.setVisibility(View.VISIBLE);
        tvFlowPctEv.setText(String.format(Locale.ITALY, "%.0f%%", 100.0 * ev / known));
        tvFlowPctSeries.setText(String.format(Locale.ITALY, "%.0f%%", 100.0 * series / known));
        tvFlowPctParallel.setText(String.format(Locale.ITALY, "%.0f%%", 100.0 * parallel / known));
        tvFlowPctCharge.setText(String.format(Locale.ITALY, "%.0f%%", 100.0 * chr / known));
        tvFlowPctIdle.setText(String.format(Locale.ITALY, "%.0f%%", 100.0 * idle / known));
    }

    // Imposta una volta sola (onCreate) il colore fisso del pallino di un blocco flusso
    // energia nel dettaglio viaggio - stessi colori di EnergyFlowUtil, mai gli stessi
    // dell'accento dell'app (cosi' restano riconoscibili come "stato", non come tema).
    private void tintFlowDot(int viewId, EnergyFlowUtil.Bucket bucket) {
        View dot = tripDetailPanel.findViewById(viewId);
        if (dot == null || dot.getBackground() == null) return;
        android.graphics.drawable.Drawable bg = dot.getBackground().mutate();
        dot.setBackground(bg);
        bg.setTint(EnergyFlowUtil.colorForBucket(bucket));
    }


    // Esporta su USB sia la traccia GPX (se presente, solo viaggi automatici) sia un file
    // di riepilogo con data/ora, km/litri/media e il log raccolto durante il viaggio.
    // Tutto dentro JaeDrive_trips/<data e ora inizio viaggio>/, una sottocartella per
    // ogni trip (creata al volo se non esiste), invece che file sparsi alla radice USB.
    private void exportTripRecord(TripRecord r) {
        String baseName = (r.gpxPath != null)
            ? new File(r.gpxPath).getName().replace(".gpx", "")
            : "TripManuale_" + DateFormat.format("yyyyMMdd_HHmmss", r.endTime);
        String tripSubDir = "JaeDrive_trips/" + DateFormat.format("ddMMyyyy_HH-mm", r.startTime);

        StringBuilder info = new StringBuilder();
        info.append(getString(R.string.export_header)).append("\n");
        info.append(getString(R.string.export_type_label))
            .append(TripRecord.TYPE_AUTO.equals(r.type) ? getString(R.string.export_type_auto) : getString(R.string.export_type_manual))
            .append("\n");
        if (r.startLabel != null && !r.startLabel.isEmpty()) {
            info.append(getString(R.string.export_start_address_label)).append(r.startLabel).append("\n");
        }
        if (r.label != null && !r.label.isEmpty()) {
            // AUTO: r.label e' l'indirizzo di arrivo (reverse geocoding) - "Arrivo:", non
            // il generico "Riferimento:" usato invece per i MANUAL (dove r.label e'
            // semplicemente il nome dello slot al momento del reset, non un indirizzo).
            String prefix = TripRecord.TYPE_AUTO.equals(r.type)
                ? getString(R.string.export_arrival_label) : getString(R.string.export_reference_label);
            info.append(prefix).append(r.label).append("\n");
        }
        info.append(getString(R.string.export_start_label)).append(DateFormat.format("dd/MM/yyyy HH:mm:ss", r.startTime)).append("\n");
        info.append(getString(R.string.export_end_label)).append(DateFormat.format("dd/MM/yyyy HH:mm:ss", r.endTime)).append("\n");
        info.append(getString(R.string.export_km_label)).append(String.format(Locale.ITALY, "%.1f", r.kmDelta)).append(" km\n");
        info.append(getString(R.string.export_liters_label)).append(r.litersDelta != null
            ? String.format(Locale.ITALY, "%.2f L", r.litersDelta) : getString(R.string.export_na)).append("\n");
        info.append(getString(R.string.export_avg_label)).append(r.avgConsumption != null
            ? String.format(Locale.ITALY, "%.2f km/l", r.avgConsumption) : getString(R.string.export_na)).append("\n");
        if (r.logPath != null) {
            info.append(getString(R.string.export_log_header)).append(readFileQuiet(new File(r.logPath)));
        }
        exportToUsb(tripSubDir, baseName + "_dati.txt", info.toString().getBytes());

        if (r.gpxPath != null) {
            File gpxFile = new File(r.gpxPath);
            if (gpxFile.exists()) {
                try {
                    exportToUsb(tripSubDir, gpxFile.getName(), Files.readAllBytes(gpxFile.toPath()));
                } catch (Exception e) {
                    appendLog("Errore lettura gpx per export: " + e);
                }
            }
        }
    }

    private String readFileQuiet(File f) {
        if (f == null || !f.exists()) return "(log non disponibile)";
        try {
            return new String(Files.readAllBytes(f.toPath()));
        } catch (Exception e) {
            return "(errore lettura log: " + e + ")";
        }
    }

    // --- Sezione Impostazioni ---

    private void setupImpostazioni() {
        refreshUnitToggles();
        toggleUnitKm.setOnClickListener(v -> { Prefs.setDistanceMiles(this, false); onUnitsChanged(); });
        toggleUnitMi.setOnClickListener(v -> { Prefs.setDistanceMiles(this, true); onUnitsChanged(); });
        toggleUnitLiters.setOnClickListener(v -> { Prefs.setConsumptionGallons(this, false); onUnitsChanged(); });
        toggleUnitGal.setOnClickListener(v -> { Prefs.setConsumptionGallons(this, true); onUnitsChanged(); });

        switchGps.setChecked(Prefs.isGpsTrackEnabled(this));
        switchGps.setOnCheckedChangeListener((btn, checked) -> {
            Prefs.setGpsTrackEnabled(this, checked);
            appendLog("Traccia GPS " + (checked ? "attivata" : "disattivata") + " dalle Impostazioni");
        });

        switchDebugMode.setChecked(Prefs.isDebugModeEnabled(this));
        switchDebugMode.setOnCheckedChangeListener((btn, checked) -> {
            boolean wasEnabled = Prefs.isDebugModeEnabled(this);
            Prefs.setDebugModeEnabled(this, checked);
            if (checked && !wasEnabled) {
                // Log solo l'attivazione stessa: se era disattivata non c'era nulla da registrare prima.
                appendLog("Modalità debug attivata dalle Impostazioni");
            }
            if (contentLog.getVisibility() == View.VISIBLE) renderLogView();
        });

        String versionName = "?";
        try {
            versionName = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) {
        }
        tvAppVersion.setText(getString(R.string.app_name) + " " + versionName);

        setupLanguageToggle();
        setupCloudSection();
    }

    // Card "CLOUD" in Impostazioni: stato associazione + pulsante che apre il dialogo di
    // pairing (o rimuove l'associazione esistente). refreshCloudSection() e' richiamata
    // anche alla chiusura riuscita del dialogo, per aggiornare subito lo stato senza dover
    // riaprire la sezione Impostazioni.
    private void setupCloudSection() {
        refreshCloudSection();
        btnCloudPair.setOnClickListener(v -> showPairingDialog());
        btnCloudUnpair.setOnClickListener(v -> showConfirmDialog(
            getString(R.string.dialog_unpair_title),
            getString(R.string.dialog_unpair_message),
            getString(R.string.label_cloud_unpair_button),
            true,
            () -> {
                Prefs.clearCloudPairing(this);
                refreshCloudSection();
                Toast.makeText(this, getString(R.string.toast_cloud_unpaired), Toast.LENGTH_SHORT).show();
            }));
    }

    private void refreshCloudSection() {
        boolean paired = Prefs.isCloudPaired(this);
        tvCloudStatus.setText(paired ? getString(R.string.label_cloud_paired) : getString(R.string.label_cloud_not_paired));
        tvCloudSubtitle.setText(paired ? getString(R.string.label_cloud_paired_subtitle) : getString(R.string.label_cloud_not_paired_subtitle));
        btnCloudPair.setVisibility(paired ? View.GONE : View.VISIBLE);
        btnCloudUnpair.setVisibility(paired ? View.VISIBLE : View.GONE);
    }

    // Lingua: usa il per-app language di AppCompatDelegate (persiste da solo, ha priorita'
    // sulla lingua di sistema una volta impostato esplicitamente). Finche' l'utente non
    // sceglie mai, la lingua mostrata segue il sistema - risolta automaticamente da Android
    // tra i due set di risorse disponibili (values/ = italiano, values-en/ = inglese).
    // Cambiare lingua ricrea l'Activity (comportamento standard di setApplicationLocales()).
    private void setupLanguageToggle() {
        refreshLanguageToggle();
        toggleLangIt.setOnClickListener(v -> androidx.appcompat.app.AppCompatDelegate.setApplicationLocales(
            androidx.core.os.LocaleListCompat.forLanguageTags("it")));
        toggleLangEn.setOnClickListener(v -> androidx.appcompat.app.AppCompatDelegate.setApplicationLocales(
            androidx.core.os.LocaleListCompat.forLanguageTags("en")));
    }

    private void refreshLanguageToggle() {
        boolean isEnglish = "en".equals(getResources().getConfiguration().getLocales().get(0).getLanguage());
        styleToggle(toggleLangIt, !isEnglish);
        styleToggle(toggleLangEn, isEnglish);
    }

    private void refreshUnitToggles() {
        styleToggle(toggleUnitKm, !Prefs.isDistanceMiles(this));
        styleToggle(toggleUnitMi, Prefs.isDistanceMiles(this));
        styleToggle(toggleUnitLiters, !Prefs.isConsumptionGallons(this));
        styleToggle(toggleUnitGal, Prefs.isConsumptionGallons(this));
    }

    // Le unita' influenzano solo la formattazione: ricalcoliamo le viste che mostrano
    // distanze/consumi, senza toccare i dati salvati (sempre km/litri internamente).
    private void onUnitsChanged() {
        refreshUnitToggles();
        renderTripConsumption();
        if (contentStorico.getVisibility() == View.VISIBLE) refreshTrackList();
    }

    // Salva il log/i percorsi alla RADICE della USB. Il selettore SAF (ACTION_OPEN_DOCUMENT_TREE)
    // non funziona su questo ROM (manca l'app "Gestione file"/DocumentsUI, il tentativo
    // finiva sempre silenziosamente nel fallback interno). Usiamo invece il permesso speciale
    // MANAGE_EXTERNAL_STORAGE (concesso una volta dalle Impostazioni di sistema, non un picker)
    // che permette di scrivere con java.io.File diretto sulla radice di qualsiasi volume.
    private void saveLogToUsb() {
        String filename = "JaeDrive_log_" + DateFormat.format("yyyyMMdd_HHmmss", System.currentTimeMillis()) + ".txt";
        exportToUsb(null, filename, logBuffer.toString().getBytes());
    }

    // Punto unico di export: usato dal log (radice USB, subDir null) e dalla tab PERCORSI
    // (dentro JaeDrive_trips/<sottocartella del trip>, un solo viaggio puo' generare piu'
    // di una chiamata, es. .gpx + file dati/log, tutte messe in coda se manca ancora il
    // permesso "Accesso a tutti i file").
    private void exportToUsb(String subDir, String filename, byte[] content) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !android.os.Environment.isExternalStorageManager()) {
            boolean firstMiss = pendingExports.isEmpty();
            pendingExports.add(new PendingExport(subDir, filename, content));
            if (!firstMiss) return; // le impostazioni sono gia' state aperte per questo export
            appendLog("Serve il permesso 'Accesso a tutti i file': apro le impostazioni, concedilo e riprova ESPORTA");
            try {
                Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
                Toast.makeText(this, getString(R.string.toast_grant_all_files_access), Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                appendLog("Impossibile aprire le impostazioni permesso: " + e);
                List<PendingExport> pending = new ArrayList<>(pendingExports);
                pendingExports.clear();
                for (PendingExport pe : pending) exportToExternalStorageFallback(pe.subDir, pe.filename, pe.content);
            }
            return;
        }
        writeToUsbRoot(subDir, filename, content);
    }

    // Scrive alla radice (o nella sottocartella subDir, creata se non esiste) di ogni
    // volume RIMOVIBILE trovato via StorageManager. Verificato sul campo:
    // getExternalFilesDirs() NON vede la chiavetta USB su questo ROM anche se e' montata
    // e visibile (StorageManager.getStorageVolumes() la trova con removable=true) - quindi
    // usiamo StorageVolume.getDirectory() (API 30+) direttamente, che da' il path reale
    // della radice del volume senza passare da Android/data/....
    private void writeToUsbRoot(String subDir, String filename, byte[] content) {
        List<File> usbRoots = findRemovableVolumeRoots();
        if (usbRoots.isEmpty()) {
            appendLog("Nessun volume rimovibile con path accessibile, uso storage esterno app-specific");
            logStorageVolumesDiagnostic();
            exportToExternalStorageFallback(subDir, filename, content);
            return;
        }
        boolean saved = false;
        for (File root : usbRoots) {
            File targetDir = subDir != null ? new File(root, subDir) : root;
            if (!targetDir.exists() && !targetDir.mkdirs()) {
                appendLog("Impossibile creare la cartella " + targetDir);
                continue;
            }
            File outFile = new File(targetDir, filename);
            try (java.io.FileOutputStream fos = new java.io.FileOutputStream(outFile)) {
                fos.write(content);
                appendLog("Esportato su USB: " + outFile.getAbsolutePath());
                Toast.makeText(this, getString(R.string.toast_exported, outFile.getAbsolutePath()), Toast.LENGTH_LONG).show();
                saved = true;
            } catch (Exception e) {
                appendLog("Errore scrittura USB " + outFile + ": " + e);
            }
        }
        if (!saved) {
            exportToExternalStorageFallback(subDir, filename, content);
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
                if (dir != null) {
                    appendLog("Volume rimovibile trovato: " + v.getDescription(this) + " -> " + dir);
                    roots.add(dir);
                } else {
                    appendLog("Volume rimovibile \"" + v.getDescription(this) + "\" senza path accessibile (state=" + v.getState() + ")");
                }
            }
        } catch (Exception e) {
            appendLog("Errore ricerca volumi rimovibili: " + e);
        }
        return roots;
    }

    // Diagnostica: getExternalFilesDirs() ignora permessi, quindi se non vede la USB e' probabile
    // che Android non la stia montando affatto come storage condiviso (non un problema di permesso).
    // StorageManager.getStorageVolumes() e' piu' basso livello e mostra TUTTI i volumi noti al sistema,
    // anche quelli che l'app non può usare, utile per capire se la USB e' vista ma non esposta.
    private void logStorageVolumesDiagnostic() {
        try {
            android.os.storage.StorageManager sm =
                (android.os.storage.StorageManager) getSystemService(Context.STORAGE_SERVICE);
            List<android.os.storage.StorageVolume> volumes = sm.getStorageVolumes();
            appendLog("StorageManager: " + volumes.size() + " volumi noti al sistema");
            for (android.os.storage.StorageVolume v : volumes) {
                appendLog("  volume: desc=\"" + v.getDescription(this) + "\" removable=" + v.isRemovable()
                    + " state=" + v.getState() + " uuid=" + v.getUuid()
                    + " primary=" + v.isPrimary());
            }
        } catch (Exception e) {
            appendLog("Errore diagnostica StorageManager: " + e);
        }
    }


    // Ultimo fallback (nessuna USB rimovibile o permesso non concedibile): storage app-specific.
    private void exportToExternalStorageFallback(String subDir, String filename, byte[] content) {
        File[] dirs = getExternalFilesDirs(null);
        if (dirs == null || dirs.length == 0) {
            appendLog("Nessuno storage esterno disponibile");
            Toast.makeText(this, getString(R.string.toast_save_failed_no_storage), Toast.LENGTH_LONG).show();
            return;
        }
        boolean saved = false;
        for (File dir : dirs) {
            if (dir == null) continue;
            File targetDir = subDir != null ? new File(dir, subDir) : dir;
            if (!targetDir.exists() && !targetDir.mkdirs()) {
                appendLog("Impossibile creare la cartella " + targetDir);
                continue;
            }
            File outFile = new File(targetDir, filename);
            try (java.io.FileOutputStream fos = new java.io.FileOutputStream(outFile)) {
                fos.write(content);
                appendLog("Salvato su: " + outFile.getAbsolutePath());
                saved = true;
            } catch (Exception e) {
                appendLog("Errore salvataggio su " + targetDir + ": " + e);
            }
        }
        Toast.makeText(this, saved ? getString(R.string.toast_saved_fallback, getPackageName()) : getString(R.string.toast_save_failed),
            saved ? Toast.LENGTH_LONG : Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mapView != null) mapView.onResume();
        // Se l'utente ha appena concesso "Accesso a tutti i file" dalle Impostazioni e torna
        // indietro, completa automaticamente tutti gli export rimasti in sospeso.
        if (!pendingExports.isEmpty()
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && android.os.Environment.isExternalStorageManager()) {
            List<PendingExport> pending = new ArrayList<>(pendingExports);
            pendingExports.clear();
            for (PendingExport pe : pending) writeToUsbRoot(pe.subDir, pe.filename, pe.content);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mapView != null) mapView.onPause();
    }

    // Tenere il buffer di log illimitato (ore di polling VDB ogni 2s) rendeva ogni
    // singola riga sempre piu' costosa da ri-renderizzare per intero - vedi appendLog().
    private static final int MAX_LOG_BUFFER_CHARS = 150_000;

    // Con la modalita' debug disattivata, non accumuliamo nulla in memoria/su file: Log.d
    // resta comunque gratuito (solo logcat) per un ADB al volo senza dover riattivare nulla.
    //
    // PRIMA: ogni riga chiamava renderLogView() incondizionatamente, che rileggeva da
    // disco l'intero tracking_log.txt di TrackingService (fino a 200KB) e rifaceva il
    // setText() dell'intero buffer combinato (mai troncato, quindi sempre piu' grande
    // nel tempo) - lavoro pesante ripetuto ad ogni singolo evento, anche a tab LOG non
    // visibile, ed e' la causa del rallentamento segnalato aprendo quel tab (il testo
    // da rimisurare/disegnare cresceva senza limite). Ora: aggiorniamo la vista SOLO se
    // il tab e' effettivamente visibile, e con un append() incrementale (economico, non
    // rifà la misura dell'intero blocco) invece del re-render completo.
    private void appendLog(String msg) {
        Log.d(TAG, msg);
        if (!Prefs.isDebugModeEnabled(this)) return;
        String line = DateFormat.format("HH:mm:ss", System.currentTimeMillis()) + "  " + msg;
        runOnUiThread(() -> {
            logBuffer.append(line).append("\n");
            if (logBuffer.length() > MAX_LOG_BUFFER_CHARS) {
                logBuffer.delete(0, logBuffer.length() - MAX_LOG_BUFFER_CHARS);
            }
            if (contentLog.getVisibility() == View.VISIBLE) {
                tvLog.append(line + "\n");
                if (logAutoScroll) {
                    scrollLog.post(() -> scrollLog.fullScroll(View.FOCUS_DOWN));
                }
            }
        });
    }

    // Il log mostrato combina gli eventi dell'Activity con quelli persistiti su file
    // da TrackingService (che gira anche ad app chiusa e non ha una UI dove scrivere).
    private void renderLogView() {
        if (!Prefs.isDebugModeEnabled(this)) {
            tvLog.setText(getString(R.string.log_debug_disabled_placeholder));
            return;
        }
        String combined = logBuffer.toString();
        String serviceLog = readServiceLog();
        if (!serviceLog.isEmpty()) {
            combined += "\n=== LOG TrackingService (background) ===\n" + serviceLog;
        }
        tvLog.setText(combined);
        // Un re-render completo (apertura tab, pulizia log) riparte sempre in fondo e
        // riattiva l'auto-scroll, anche se l'utente l'aveva sospeso leggendo log vecchi
        // in una sessione precedente - qui e' un contenuto nuovo, non ha senso restare
        // scrollati a meta' di un testo appena ridisegnato.
        logAutoScroll = true;
        scrollLog.post(() -> scrollLog.fullScroll(View.FOCUS_DOWN));
    }

    private String readServiceLog() {
        File f = new File(getFilesDir(), "tracking_log.txt");
        if (!f.exists()) return "";
        try {
            return new String(Files.readAllBytes(f.toPath()));
        } catch (Exception e) {
            return "(errore lettura log service: " + e + ")";
        }
    }

    // Cancellazione irreversibile: conferma esplicita prima di procedere, stesso
    // pattern gia' usato per il reset di un trip manuale e la cancellazione dallo Storico.
    private void confirmClearLog() {
        showConfirmDialog(
            getString(R.string.dialog_clear_log_title),
            getString(R.string.dialog_clear_log_message),
            getString(R.string.label_clear_log),
            true,
            this::clearLog);
    }

    // Ripulisce sia il buffer in memoria dell'Activity sia il file su disco di
    // TrackingService (che continua a girare in background anche ad app chiusa e
    // potrebbe riscriverci sopra subito dopo - normale, non e' un problema: e' solo
    // il log accumulato FINORA che l'utente vuole azzerare).
    private void clearLog() {
        logBuffer.setLength(0);
        File f = new File(getFilesDir(), "tracking_log.txt");
        if (f.exists() && !f.delete()) {
            appendLog("Impossibile eliminare " + f);
        }
        renderLogView();
        Toast.makeText(this, getString(R.string.toast_log_cleared), Toast.LENGTH_SHORT).show();
    }

    private void connectCar() {
        appendLog("connectCar(): chiamata Car.createCar()");
        try {
            mCar = Car.createCar(this, new ServiceConnection() {
                @Override
                public void onServiceConnected(ComponentName name, IBinder service) {
                    appendLog("onServiceConnected: " + name);
                    try {
                        mCarPropertyManager = (CarPropertyManager) mCar.getCarManager(Car.PROPERTY_SERVICE);
                    } catch (Exception e) {
                        appendLog("getCarManager EXCEPTION: " + e);
                    }
                    if (mCarPropertyManager != null) {
                        registerCallbacks();
                        readStaticProperties();
                        discoverAllProperties();
                    } else {
                        appendLog("CarPropertyManager è NULL");
                    }
                }

                @Override
                public void onServiceDisconnected(ComponentName name) {
                    appendLog("onServiceDisconnected: " + name);
                }
            });
            if (mCar == null) {
                appendLog("Car.createCar() ha restituito NULL");
                return;
            }
            mCar.connect();
        } catch (Exception e) {
            appendLog("connectCar EXCEPTION: " + e);
        }
    }

    private void registerCallbacks() {
        CarPropertyManager.CarPropertyEventCallback callback = new CarPropertyManager.CarPropertyEventCallback() {
            @Override
            public void onChangeEvent(CarPropertyValue value) {
                runOnUiThread(() -> handlePropertyChange(value));
            }

            @Override
            public void onErrorEvent(int propId, int zone) {
                appendLog("onErrorEvent 0x" + Integer.toHexString(propId) + " zone=" + zone);
                updateUiError(propId, "onErrorEvent");
            }
        };

        int[] propsToSubscribe = {GEAR_SELECTION, CURRENT_GEAR, PERF_VEHICLE_SPEED};

        for (int propId : propsToSubscribe) {
            try {
                mCarPropertyManager.registerCallback(callback, propId, CarPropertyManager.SENSOR_RATE_NORMAL);
                appendLog("Subscribed: 0x" + Integer.toHexString(propId));
            } catch (Exception e) {
                appendLog("Errore subscribe 0x" + Integer.toHexString(propId) + ": " + e);
                updateUiError(propId, e.getMessage());
            }
        }
    }

    private void readStaticProperties() {
        // Leggi valori correnti una volta
        int[] propsToRead = {GEAR_SELECTION, PERF_VEHICLE_SPEED};
        for (int propId : propsToRead) {
            try {
                CarPropertyValue<?> val = mCarPropertyManager.getProperty(propId, 0);
                if (val != null) {
                    appendLog("0x" + Integer.toHexString(propId) + " = " + val.getValue()
                        + " tipo: " + val.getValue().getClass().getSimpleName());
                    runOnUiThread(() -> handlePropertyChange(val));
                } else {
                    appendLog("0x" + Integer.toHexString(propId) + ": getProperty ha restituito NULL");
                }
            } catch (Exception e) {
                appendLog("Errore read 0x" + Integer.toHexString(propId) + ": " + e);
                updateUiError(propId, e.getMessage());
            }
        }
        tryReadStandardVin();
    }

    // Terzo tentativo VIN, stavolta via CarPropertyManager standard invece che VDB (vedi
    // costante INFO_VIN sopra). Se lancia SecurityException il permesso non basta a
    // sbloccarla (come CAR_MILEAGE/CAR_VENDOR_EXTENSION - servirebbe un'app di sistema);
    // se restituisce null il VHAL non la implementa proprio; in entrambi i casi logghiamo
    // per distinguerli chiaramente invece di limitarsi a "non ha funzionato".
    private void tryReadStandardVin() {
        try {
            CarPropertyValue<?> val = mCarPropertyManager.getProperty(INFO_VIN, 0);
            if (val != null && val.getValue() instanceof String) {
                String vin = (String) val.getValue();
                appendLog("[CarPropertyManager] INFO_VIN = \"" + vin + "\"");
                if (!vinResolved && vin.trim().length() >= 10) {
                    tvVehicleVin.setText(vin.trim());
                    vinResolved = true;
                }
            } else {
                appendLog("[CarPropertyManager] INFO_VIN: getProperty ha restituito " + val);
            }
        } catch (Exception e) {
            appendLog("[CarPropertyManager] Errore lettura INFO_VIN: " + e);
        }
    }

    // Enumera TUTTE le property esposte dal VHAL di questa auto (anche quelle non standard/vendor),
    // utile per trovare dati come "litri consumati dal reset" che non esistono in VehiclePropertyIds.
    private void discoverAllProperties() {
        Map<Integer, String> nameMap = buildPropertyNameMap();
        List<CarPropertyConfig> configs;
        try {
            configs = mCarPropertyManager.getPropertyList();
        } catch (Exception e) {
            appendLog("getPropertyList EXCEPTION: " + e);
            return;
        }

        appendLog("=== DISCOVERY: " + configs.size() + " property esposte dal VHAL ===");
        for (CarPropertyConfig<?> cfg : configs) {
            int id = cfg.getPropertyId();
            String name = nameMap.getOrDefault(id, "SCONOSCIUTA/VENDOR");
            appendLog(String.format("0x%08X %s  access=%s change=%s areas=%s",
                id, name, accessToString(cfg.getAccess()), changeModeToString(cfg.getChangeMode()),
                Arrays.toString(cfg.getAreaIds())));

            try {
                Object min = cfg.getMinValue();
                Object max = cfg.getMaxValue();
                if (min != null || max != null) {
                    appendLog("   range configurato: min=" + min + " max=" + max);
                }
            } catch (Exception ignored) {
            }

            if (cfg.getAccess() == CarPropertyConfig.VEHICLE_PROPERTY_ACCESS_READ
                    || cfg.getAccess() == CarPropertyConfig.VEHICLE_PROPERTY_ACCESS_READ_WRITE) {
                int[] areas = cfg.getAreaIds();
                int area = (areas != null && areas.length > 0) ? areas[0] : 0;
                try {
                    CarPropertyValue<?> val = mCarPropertyManager.getProperty(id, area);
                    appendLog("   -> valore: " + (val != null ? valueToString(val.getValue()) : "null"));
                } catch (Exception e) {
                    appendLog("   -> errore lettura: " + e.getClass().getSimpleName() + " " + e.getMessage());
                }
            }
        }
        appendLog("=== FINE DISCOVERY ===");
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

    // Mappa ID numerico -> nome costante, via reflection su VehiclePropertyIds.
    // Le property non presenti nella mappa sono estensioni vendor non documentate.
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

    private void handlePropertyChange(CarPropertyValue<?> value) {
        int propId = value.getPropertyId();
        Object val = value.getValue();
        appendLog("onChange 0x" + Integer.toHexString(propId) + " = " + val + " (" + val.getClass().getSimpleName() + ")");

        if (propId == GEAR_SELECTION || propId == CURRENT_GEAR) {
            int gear = (val instanceof Integer) ? (Integer) val : -1;
            tvGear.setText(gearToLabel(gear));
            tvGear.getBackground().setTint(gearToColor(gear));
        } else if (propId == PERF_VEHICLE_SPEED) {
            // PERF_VEHICLE_SPEED e' in m/s per spec Android (confermato sul campo:
            // 8.33 m/s registrato a ~30 km/h reali) - va convertito in km/h per la UI.
            tvSpeed.setText(String.format("%.0f", toFloat(val) * 3.6f));
        }
    }

    // Valori da android.car.VehicleGear (verificati via SDK jar).
    private String gearToLabel(int gear) {
        switch (gear) {
            case 4: return "P";
            case 2: return "R";
            case 1: return "N";
            case 8: return "D";
            case 16: return "1";
            case 32: return "2";
            case 64: return "3";
            case 128: return "4";
            case 256: return "5";
            case 512: return "6";
            case 1024: return "7";
            case 2048: return "8";
            case 4096: return "9";
            default: return "?";
        }
    }

    private int gearToColor(int gear) {
        switch (gear) {
            case 4: return ContextCompat.getColor(this, R.color.surface_container_high); // P - grigio
            case 2: return 0xFF93000A; // R - rosso scuro (error_container)
            case 1: return 0xFFB8860B; // N - ambra
            case 8: return 0xFF2E7D32; // D - verde
            default: return ContextCompat.getColor(this, R.color.primary_container); // marce manuali - blu elettrico
        }
    }

    private void updateUiError(int propId, String msg) {
        if (propId == GEAR_SELECTION)    tvGear.setText(R.string.error_short);
        else if (propId == PERF_VEHICLE_SPEED) tvSpeed.setText(R.string.error_short);
    }

    private float toFloat(Object val) {
        if (val instanceof Float) return (Float) val;
        if (val instanceof Integer) return ((Integer) val).floatValue();
        return 0f;
    }

    // Client sperimentale per il bus VDB Desay (servizio CAR_INFO), scoperto via
    // reverse engineering di SVSetting.apk/SVVDSCarInfo.apk: espone drive mode,
    // flusso energia, chilometraggio, autonomia EV/ibrida, SOC batteria. Non piu'
    // mostrato come dump grezzo in dashboard: solo drive mode/SOC/carburante finiscono
    // nella barra di stato (dati "non necessari" per l'uso quotidiano rimossi).
    private void connectVdbInfo() {
        vdInfoClient = new VDInfoClient(this, new VDInfoClient.Listener() {
            @Override
            public void onLog(String msg) {
                appendLog("[VDB] " + msg);
            }

            @Override
            public void onValue(int key, int[] value) {
                runOnUiThread(() -> {
                    vdbValues.put(key, value);
                    updateFooterStatus();
                    if (key == KEY_VIN) renderVin(value, false);
                    if (key == KEY_VIN_ALT) renderVin(value, true);
                });
                // L'accumulo km (ID_TRIP) e l'aggiornamento carburante per TripConsumption/
                // ManualTripComputer avvengono SOLO in TrackingService (unica fonte, gira
                // sempre in background): farlo anche qui duplicherebbe l'accumulo del delta
                // e sballerebbe il conteggio. MainActivity si limita a rileggere lo stato
                // condiviso ogni ~3s (vedi tripRefreshRunnable).
            }

            @Override
            public void onBindStateChanged(boolean bound) {
                appendLog("VDB CAR_INFO bound=" + bound);
            }
        });
        vdInfoClient.connect();
    }

    // Barra di stato in fondo alla Dashboard: modalita' di guida reale, SOC batteria e
    // carburante, uniche informazioni VDB ritenute utili per l'uso quotidiano.
    private void updateFooterStatus() {
        int[] modeRaw = vdbValues.get(KEY_DRIVE_MODE);
        if (modeRaw != null && modeRaw.length > 0) {
            tvFooterMode.setText(driveModeLabel(modeRaw[0]));
            int color = driveModeColor(modeRaw[0]);
            tvFooterMode.setTextColor(color);
            iconFooterMode.setColorFilter(color);
        }
        int[] socRaw = vdbValues.get(KEY_DISPLAY_SOC);
        if (socRaw != null && socRaw.length >= 2) {
            float soc = (socRaw[0] * 256 + socRaw[1]) / 100.0f;
            tvFooterSoc.setText(String.format(Locale.ITALY, "%.0f%%", soc));
        }
        int[] fuelRaw = vdbValues.get(KEY_FUEL_PERCENT);
        if (fuelRaw != null && fuelRaw.length >= 2) {
            float pct = (fuelRaw[0] * 256 + fuelRaw[1]) / 10.0f;
            tvFooterFuel.setText(String.format(Locale.ITALY, "%.0f%%", pct));
        }
        int[] flowRaw = vdbValues.get(KEY_ENERGY_FLOW);
        if (flowRaw != null && flowRaw.length > 0) {
            int color = EnergyFlowUtil.colorForBucket(EnergyFlowUtil.bucketFor(flowRaw[0]));
            dotFooterFlow.getBackground().setTint(color);
            tvFooterFlow.setText(energyFlowLabel(flowRaw[0]));
            tvFooterFlow.setTextColor(color);
        }
    }

    // Etichetta breve per il badge "flusso energia" nella hero card, stessi 5 bucket
    // usati per colorare la traccia GPS (vedi EnergyFlowUtil).
    private String energyFlowLabel(int value) {
        switch (EnergyFlowUtil.bucketFor(value)) {
            case EV: return getString(R.string.label_flow_ev);
            case SERIES: return getString(R.string.label_flow_series);
            case PARALLEL: return getString(R.string.label_flow_parallel);
            case CHR: return getString(R.string.label_flow_regen);
            default: return getString(R.string.label_flow_unknown);
        }
    }

    // VIN in Impostazioni: due segnali sperimentali candidati, nessuno con un caller di
    // riferimento trovato nei decompile - ID_VIN=0x9/READONLY_INFO confermato sul campo
    // che restituisce sempre IS_NULL su questa auto (segnale genuinamente assente li', non
    // un problema di decodifica), quindi si tenta anche ID_VIN_ALT=0x10/MODULE_DOANOSE
    // (vedi VDInfoClient). Se la decodifica ASCII produce una stringa plausibile (10-17
    // caratteri alfanumerici, lo standard VIN reale) la mostriamo; altrimenti mostriamo
    // l'array grezzo cosi' resta comunque visibile per un'eventuale diagnosi futura invece
    // di sparire silenziosamente. Una volta trovata una stringa plausibile da una fonte, non
    // la sovrascriviamo piu' con dati grezzi/peggiori dall'altra fonte.
    private boolean vinResolved = false;

    private void renderVin(int[] raw, boolean fromAlt) {
        if (tvVehicleVin == null) return;
        appendLog(String.format("[VDB] VIN%s raw=%s", fromAlt ? " (alt/DOANOSE)" : "", Arrays.toString(raw)));
        if (vinResolved) return;
        String decoded = VDInfoClient.decodeAsciiString(raw);
        if (decoded != null && decoded.length() >= 10) {
            tvVehicleVin.setText(decoded);
            vinResolved = true;
        } else if (raw != null && raw.length > 0) {
            tvVehicleVin.setText(Arrays.toString(raw));
        }
    }

    private String driveModeLabel(int v) {
        return v == 0 ? "ECO" : v == 1 ? "NORMAL" : v == 2 ? "SPORT" : "?";
    }

    // ECO = verde (efficienza), NORMAL = azzurro (accento standard dell'app), SPORT = rosso
    // (consumo/aggressivita'), coerente a colpo d'occhio con lo stesso significato usato
    // per il trend del consumo medio.
    private int driveModeColor(int v) {
        if (v == 0) return ContextCompat.getColor(this, R.color.trend_positive);
        if (v == 2) return ContextCompat.getColor(this, R.color.trend_negative);
        return ContextCompat.getColor(this, R.color.primary_container);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (mCar != null && mCar.isConnected()) mCar.disconnect();
        if (vdInfoClient != null) vdInfoClient.disconnect();
        tripRefreshHandler.removeCallbacks(tripRefreshRunnable);
    }
}
