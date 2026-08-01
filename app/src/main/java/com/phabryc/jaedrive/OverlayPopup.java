package com.phabryc.jaedrive;

import android.content.Context;
import android.graphics.PixelFormat;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

// Piccola finestra overlay (TYPE_APPLICATION_OVERLAY) per avvisare l'utente di eventi
// rilevati in background - vedi TrackingService (cambio livello rigenerazione, rifornimento
// carburante rilevato) - senza dover aprire l'app. Richiede SYSTEM_ALERT_WINDOW
// (AndroidManifest.xml), un permesso "speciale" (Settings.canDrawOverlays(), non un
// dangerous permission classico) - confermato sul campo 2026-08-02 che su questo
// dispositivo e' gia' concesso di suo (a differenza di ACCESS_FINE_LOCATION), quindi nessun
// intervento esterno e' servito qui; se non lo fosse su un altro dispositivo/modello, i
// metodi qui sotto restano comunque un no-op silenzioso (solo un log), mai un crash.
public class OverlayPopup {

    private static final String TAG = "JaeDrive-Overlay";
    // Un solo popup alla volta: se ne arriva uno nuovo mentre un altro e' ancora visibile
    // (es. cambio rigenerazione durante la scelta rifornimento), il vecchio viene rimosso
    // prima di aggiungere il nuovo, invece di impilarli sullo schermo.
    private static View currentView;
    private static WindowManager currentWm;
    // Incrementato ad ogni addOverlayView() - BUG TROVATO 2026-08-02: un popup con
    // auto-dismiss programmava "chiuditi tra N ms" con una lambda che chiamava dismiss()
    // senza sapere QUALE popup fosse ancora quello mostrato. Se il livello rigenerazione
    // cambiava due volte entro N ms, il secondo popup (appena aperto) veniva chiuso in
    // anticipo dal timer ormai "orfano" del primo. Ogni popup ora cattura la propria
    // generazione al momento dell'apertura e si auto-chiude solo se e' ancora quella corrente.
    private static int generation = 0;
    // Timer di auto-dismiss attualmente pianificato (se c'e'), per poterlo cancellare -
    // vedi showRegenLevel(): se il popup rigenerazione e' GIA' visibile quando arriva un
    // nuovo valore, aggiorniamo il testo e ripartiamo il timer invece di distruggere e
    // ricreare la finestra (nessun flicker) - richiesta esplicita 2026-08-02.
    private static Runnable pendingDismiss;
    private static final String TAG_REGEN = "regen";

    public interface OnButtonClick {
        void onClick(int index);
    }

    // Popup informativo generico, si chiude da solo dopo autoDismissMs.
    public static void showInfo(Context ctx, String message, long autoDismissMs) {
        if (!Settings.canDrawOverlays(ctx)) {
            Log.d(TAG, "Popup non mostrato: permesso SYSTEM_ALERT_WINDOW non concesso");
            return;
        }
        View view = LayoutInflater.from(ctx).inflate(R.layout.overlay_popup, null);
        ((TextView) view.findViewById(R.id.tv_overlay_message)).setText(message);
        scheduleAutoDismiss(ctx, view, autoDismissMs);
    }

    // Popup dedicato al cambio livello rigenerazione (richiesta esplicita 2026-08-02: logo
    // in alto a sinistra + titolo, valore su una riga separata piu' grande) - si chiude da
    // solo dopo autoDismissMs, stessa logica "passiva" di showInfo() ma layout diverso
    // (vedi overlay_regen_popup.xml).
    public static void showRegenLevel(Context ctx, String valueLabel, long autoDismissMs) {
        if (!Settings.canDrawOverlays(ctx)) {
            Log.d(TAG, "Popup non mostrato: permesso SYSTEM_ALERT_WINDOW non concesso");
            return;
        }
        if (currentView != null && TAG_REGEN.equals(currentView.getTag())) {
            // Gia' visibile: aggiorna il valore e riparti col timer invece di distruggere e
            // ricreare la finestra.
            ((TextView) currentView.findViewById(R.id.tv_regen_value)).setText(valueLabel);
            if (pendingDismiss != null) currentView.removeCallbacks(pendingDismiss);
            scheduleDismissOn(currentView, generation, autoDismissMs);
            return;
        }
        View view = LayoutInflater.from(ctx).inflate(R.layout.overlay_regen_popup, null);
        view.setTag(TAG_REGEN);
        ((TextView) view.findViewById(R.id.tv_regen_value)).setText(valueLabel);
        scheduleAutoDismiss(ctx, view, autoDismissMs);
    }

    private static void scheduleAutoDismiss(Context ctx, View view, long autoDismissMs) {
        int myGeneration = addOverlayView(ctx, view);
        if (myGeneration < 0) return; // permesso mancante/errore, vedi addOverlayView()
        scheduleDismissOn(view, myGeneration, autoDismissMs);
    }

    private static void scheduleDismissOn(View view, int myGeneration, long autoDismissMs) {
        pendingDismiss = () -> dismissIfCurrent(myGeneration);
        view.postDelayed(pendingDismiss, autoDismissMs);
    }

    // Popup con pulsanti - resta finche' l'utente non ne preme uno (nessun auto-dismiss):
    // usato per il rifornimento rilevato, dove la scelta conta (quale trip resettare, o
    // nessuno) - vedi TrackingService.showFuelRefillPopup().
    public static void showActionPopup(Context ctx, String message, String[] buttonLabels, Runnable[] actions) {
        if (buttonLabels.length != actions.length) {
            throw new IllegalArgumentException("buttonLabels e actions devono avere la stessa lunghezza");
        }
        if (!Settings.canDrawOverlays(ctx)) {
            Log.d(TAG, "Popup non mostrato: permesso SYSTEM_ALERT_WINDOW non concesso");
            return;
        }
        View view = LayoutInflater.from(ctx).inflate(R.layout.overlay_popup, null);
        ((TextView) view.findViewById(R.id.tv_overlay_message)).setText(message);

        LinearLayout row = view.findViewById(R.id.row_overlay_buttons);
        row.setVisibility(View.VISIBLE);
        for (int i = 0; i < buttonLabels.length; i++) {
            int index = i;
            boolean isLast = index == buttonLabels.length - 1;
            TextView btn = new TextView(ctx);
            btn.setText(buttonLabels[i]);
            btn.setTextColor(androidx.core.content.ContextCompat.getColor(ctx, isLast ? R.color.on_secondary_container : R.color.on_primary));
            btn.setBackgroundResource(isLast ? R.drawable.btn_secondary_bg : R.drawable.btn_primary_bg);
            // Stessa filosofia "leggibile/premibile al volo mentre si guida" del testo del
            // messaggio - bottoni piccoli in un overlay sono ancora piu' scomodi da centrare
            // col dito di un dialog normale, guardando lo schermo di sfuggita.
            btn.setTextSize(22);
            btn.setPadding(dp(ctx, 24), dp(ctx, 16), dp(ctx, 24), dp(ctx, 16));
            btn.setClickable(true);
            btn.setFocusable(true);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            if (i > 0) lp.setMarginStart(dp(ctx, 12));
            btn.setLayoutParams(lp);
            btn.setOnClickListener(v -> {
                dismiss();
                actions[index].run();
            });
            row.addView(btn);
        }

        addOverlayView(ctx, view);
    }

    // Aggiunge la view alla WindowManager con i LayoutParams comuni a tutti i popup - unico
    // punto che tocca davvero WindowManager.addView(), condiviso da showInfo()/
    // showRegenLevel()/showActionPopup() invece di ripetere la stessa costruzione tre volte.
    // Rimuove sempre prima un eventuale popup ancora visibile (mai due sovrapposti). Ritorna
    // la generazione assegnata a QUESTO popup (-1 se non mostrato per errore/permesso
    // mancante), da confrontare in dismissIfCurrent() prima di un auto-dismiss.
    private static int addOverlayView(Context ctx, View view) {
        dismiss();
        WindowManager wm = (WindowManager) ctx.getApplicationContext().getSystemService(Context.WINDOW_SERVICE);
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        params.y = dp(ctx, 40);
        try {
            wm.addView(view, params);
            currentView = view;
            currentWm = wm;
            return ++generation;
        } catch (Exception e) {
            Log.w(TAG, "Errore mostrando popup overlay: " + e);
            return -1;
        }
    }

    private static int dp(Context ctx, int value) {
        return (int) (value * ctx.getResources().getDisplayMetrics().density);
    }

    private static void dismissIfCurrent(int myGeneration) {
        if (myGeneration == generation) dismiss();
    }

    private static void dismiss() {
        if (currentView != null && currentWm != null) {
            try {
                currentWm.removeView(currentView);
            } catch (Exception ignored) {
                // Gia' rimossa (es. finestra chiusa da sola per qualche motivo) - non critico.
            }
        }
        currentView = null;
        currentWm = null;
        pendingDismiss = null;
    }
}
