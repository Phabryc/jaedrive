package com.phabryc.jaedrive;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.LinearInterpolator;
import android.widget.TextView;

import java.util.function.Consumer;

// Barra di stato persistente in background (2026-08-02, richiesta esplicita utente): a
// differenza di OverlayPopup (un solo popup transiente alla volta, si autochiude da solo),
// questa e' una coppia di finestre overlay SEPARATE da OverlayPopup - stato statico
// indipendente apposta, cosi' un popup rigenerazione/rifornimento puo' comparire SOPRA senza
// far sparire la barra (e viceversa).
//
// Perche' DUE finestre (icona + dati): l'icona deve essere toccabile, ma tutto il resto deve
// restare "not touchable" per lasciar passare i tocchi all'app sottostante. L'unica API
// pubblica Android per una finestra overlay e' "tutta touchable" o "tutta not-touchable"
// (addOnComputeInternalInsetsListener permetterebbe una regione parziale ma non e' nell'SDK
// pubblico - verificato in android.jar, assente).
//
// Il tocco funzionava in modo incoerente (2026-08-02 sera, confermato sul campo): l'icona sta
// nella stessa fascia alta 100px della notification bar del LAUNCHER di questa vettura (una
// fascia di sistema a tutta larghezza, non nostra) - un tocco li' veniva a volte intercettato
// dal launcher invece che da noi (funzionava solo con un'app in vero fullscreen sopra, es.
// CarPlay). Soluzione: la finestra icona e' alta 140px, non 100 - i primi 100px restano la
// sola icona (decorativa, non cliccabile), i 40px sotto (fuori dalla competenza del launcher)
// ospitano la freccia, la SOLA zona davvero cliccabile - vedi overlay_status_bar_icon.xml.
// Questo vincolo resta valido indipendentemente dalla direzione del collasso (vedi sotto).
public class StatusBarOverlay {

    private static final String TAG = "JaeDrive-StatusBar";
    // Circa 2/3 dello schermo in totale (icona + dati) da espansa, richiesta esplicita -
    // calcolato a runtime su widthPixels invece di un valore fisso, cosi' resta corretto su
    // head unit di dimensioni diverse (vedi jaedrive_todo, supporto multi-modello/form-factor).
    // I box a larghezza fissa possono pero' richiedere piu' spazio di questa quota (vedi
    // show(), naturalContentWidthPx) - in quel caso vince il contenuto, mai tagliato.
    private static final float WIDTH_FRACTION = 0.67f;
    private static final int CONTENT_HEIGHT_DP = 100;
    // 84dp -> 56dp (2026-08-04, richiesta esplicita): stessa larghezza per la zona icona E la
    // zona freccia, per costruzione (entrambe match_parent dentro questa unica finestra) - non
    // puo' esserci uno scalino tra le due. L'icona dentro e' stata ridotta a 46dp (era 56dp)
    // per lasciarle un margine dignitoso in una finestra piu' stretta.
    private static final int ICON_WINDOW_WIDTH_DP = 56;
    private static final int ICON_WINDOW_HEIGHT_DP = 140;
    // Non davvero zero: uno sliver quasi invisibile evita misure a 0px durante l'animazione,
    // il contenuto e' comunque nascosto (GONE) quindi non si vede nulla.
    private static final int CONTENT_COLLAPSED_WIDTH_DP = 2;
    private static final int ANIM_DURATION_MS = 260;

    private static View iconView;
    private static View arrowView;
    private static WindowManager iconWm;
    private static View contentView;
    private static WindowManager contentWm;
    private static Consumer<String> logger;
    // Se show() fallisce, non ritenta ad ogni tick VDB (spammerebbe il log e rifarebbe
    // inflate/addView in continuazione) - resta cosi' finche' non arriva un hide() esplicito
    // (es. l'utente disattiva e riattiva l'interruttore in Impostazioni).
    private static boolean lastAttemptFailed = false;

    // Non persistito apposta (stesso pattern di devSectionUnlocked in MainActivity): e' solo
    // una preferenza di comodo per la sessione di guida corrente, non una vera impostazione -
    // riparte espansa alla prossima accensione. La barra dati collassa/espande in LARGHEZZA
    // (2026-08-04, tornati indietro da un collasso in altezza - vedi toggleCollapse()),
    // ritirandosi verso sinistra/l'icona. L'altezza resta SEMPRE 100dp, non cambia mai.
    private static boolean collapsed = false;
    private static int contentExpandedWidthPx;
    private static int contentCollapsedWidthPx;

    // TrackingService la imposta una volta in onCreate() cosi' un eventuale errore finisce
    // nel file di log gia' usato per tutto il resto (appendServiceLog), non solo in logcat.
    public static void setLogger(Consumer<String> l) {
        logger = l;
    }

    public static boolean isShowing() {
        return iconView != null;
    }

    public static void show(Context ctx) {
        if (iconView != null || lastAttemptFailed) return;
        if (!Settings.canDrawOverlays(ctx)) {
            Log.d(TAG, "Barra di stato non mostrata: permesso SYSTEM_ALERT_WINDOW non concesso");
            return;
        }
        try {
            WindowManager wm = (WindowManager) ctx.getApplicationContext().getSystemService(Context.WINDOW_SERVICE);
            DisplayMetrics metrics = ctx.getResources().getDisplayMetrics();
            int contentHeightPx = dp(ctx, CONTENT_HEIGHT_DP);
            int iconWidthPx = dp(ctx, ICON_WINDOW_WIDTH_DP);
            int iconHeightPx = dp(ctx, ICON_WINDOW_HEIGHT_DP);
            int totalExpandedWidthPx = Math.round(metrics.widthPixels * WIDTH_FRACTION);
            contentCollapsedWidthPx = dp(ctx, CONTENT_COLLAPSED_WIDTH_DP);

            View icon = LayoutInflater.from(ctx).inflate(R.layout.overlay_status_bar_icon, null);
            View toggleZone = icon.findViewById(R.id.status_bar_toggle_zone);
            arrowView = icon.findViewById(R.id.iv_status_bar_arrow);
            // Se la barra riparte gia' collassata (es. un ciclo primo piano/sfondo mentre era
            // collassata - collapsed e' statico, sopravvive a show()/hide()), la freccia deve
            // puntare gia' nel verso giusto, non aspettare il prossimo tocco. ic_chevron_up e'
            // disegnata puntando in su: +90 la porta a puntare a destra (espandi verso dx),
            // -90 a sinistra (collassa verso sx) - vedi toggleCollapse() per i dettagli.
            arrowView.setRotation(collapsed ? 90f : -90f);
            toggleZone.setOnClickListener(v -> toggleCollapse());
            WindowManager.LayoutParams iconParams = new WindowManager.LayoutParams(
                iconWidthPx, iconHeightPx,
                0, 0,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                    | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
            iconParams.gravity = Gravity.TOP | Gravity.START;

            View content = LayoutInflater.from(ctx).inflate(R.layout.overlay_status_bar, null);
            content.setVisibility(collapsed ? View.GONE : View.VISIBLE);
            // I box dati sono a larghezza FISSA (non wrap_content): la loro somma potrebbe
            // superare la quota "2/3 schermo" su head unit piu' strette, tagliando l'ultimo
            // box. Si misura quindi la larghezza naturale richiesta e si usa quella se
            // maggiore della quota calcolata sulla frazione di schermo.
            content.measure(
                View.MeasureSpec.makeMeasureSpec(Integer.MAX_VALUE >> 2, View.MeasureSpec.AT_MOST),
                View.MeasureSpec.makeMeasureSpec(contentHeightPx, View.MeasureSpec.EXACTLY));
            int naturalContentWidthPx = content.getMeasuredWidth();
            contentExpandedWidthPx = Math.max(naturalContentWidthPx, Math.max(0, totalExpandedWidthPx - iconWidthPx));

            WindowManager.LayoutParams contentParams = new WindowManager.LayoutParams(
                collapsed ? contentCollapsedWidthPx : contentExpandedWidthPx, contentHeightPx,
                iconWidthPx, 0,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                    | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT);
            contentParams.gravity = Gravity.TOP | Gravity.START;

            wm.addView(icon, iconParams);
            try {
                wm.addView(content, contentParams);
            } catch (Exception e) {
                // L'icona e' gia' sullo schermo ma i dati no - non lasciarla li' orfana e
                // inutile, si toglie anche quella prima di segnalare l'errore.
                try {
                    wm.removeView(icon);
                } catch (Exception ignored) {
                }
                throw e;
            }
            iconView = icon;
            contentView = content;
            iconWm = wm;
            contentWm = wm;
        } catch (Exception e) {
            lastAttemptFailed = true;
            Log.e(TAG, "Errore mostrando la barra di stato", e);
            if (logger != null) {
                // getCause() e non solo e.toString(): un InflateException e' quasi sempre solo
                // un wrapper generico ("Error inflating class X"), la vera causa (es. un
                // attributo di tema non risolvibile) e' nella eccezione incapsulata - vista
                // sul campo il 2026-08-02 che senza questo la causa reale restava nascosta,
                // costando un giro di test in piu' per scoprirla.
                logger.accept("Barra di stato: impossibile mostrarla (" + e + causeChain(e) + ") - non ritento "
                    + "finche' non viene disattivata e riattivata dalle Impostazioni");
            }
        }
    }

    public static void hide() {
        if (iconView != null && iconWm != null) {
            try {
                iconWm.removeView(iconView);
            } catch (Exception ignored) {
                // Gia' rimossa - non critico.
            }
        }
        if (contentView != null && contentWm != null) {
            try {
                contentWm.removeView(contentView);
            } catch (Exception ignored) {
                // Gia' rimossa - non critico.
            }
        }
        iconView = null;
        arrowView = null;
        contentView = null;
        iconWm = null;
        contentWm = null;
        lastAttemptFailed = false;
    }

    // Tocco sulla zona freccia: collassa/espande la finestra dati animandone la LARGHEZZA
    // (2026-08-04, tornati indietro da un collasso in altezza - l'altezza resta sempre
    // 100dp). La finestra e' ancorata a sinistra (x = larghezza finestra icona, mai cambiata),
    // quindi restringere la larghezza la "ritira verso sinistra/l'icona" restringendosi da
    // destra. UN solo ValueAnimator(0f,1f) per entrambe le direzioni, con un interpolatore
    // LINEARE (non Decelerate: t deve corrispondere 1:1 al tempo reale, altrimenti "t=0.5" non
    // cade davvero a meta' dell'animazione percepita - bug trovato sul campo 2026-08-02, con
    // Decelerate l'espansione appariva "quasi di colpo"). La formula alpha e' costruita per
    // essere un'esatta inversione temporale: collassando scende da 1 a 0 nella PRIMA meta'
    // dell'animazione, espandendo sale da 0 a 1 nella SECONDA meta' - la seconda e'
    // letteralmente collapsing_alpha(1-t) rispetto alla prima.
    private static void toggleCollapse() {
        // Log incondizionato PRIMA di ogni controllo/guard - se il tocco non arriva affatto
        // qui, deve essere visibile nel log distinto da "arriva ma qualcosa fallisce dopo"
        // (stesso principio del logging aggiunto a show()).
        if (logger != null) logger.accept("Barra di stato: zona freccia toccata (collapsed attuale=" + collapsed + ")");
        if (contentView == null || contentWm == null) {
            if (logger != null) logger.accept("Barra di stato: tocco ignorato, contentView/contentWm nulli");
            return;
        }
        try {
            collapsed = !collapsed;
            // ic_chevron_up e' disegnata puntando in su: +90 (senso orario) la porta a
            // puntare a destra (collassata, tocca per espandere verso dx), -90 a sinistra
            // (espansa, tocca per collassare verso sx) - vedi show() per lo stato iniziale.
            if (arrowView != null) arrowView.animate().rotation(collapsed ? 90f : -90f).setDuration(ANIM_DURATION_MS).start();

            WindowManager.LayoutParams params = (WindowManager.LayoutParams) contentView.getLayoutParams();
            int from = params.width;
            int to = collapsed ? contentCollapsedWidthPx : contentExpandedWidthPx;
            contentView.setVisibility(View.VISIBLE);

            ValueAnimator anim = ValueAnimator.ofFloat(0f, 1f);
            anim.setDuration(ANIM_DURATION_MS);
            anim.setInterpolator(new LinearInterpolator());
            anim.addUpdateListener(a -> {
                float t = (float) a.getAnimatedValue();
                params.width = from + Math.round((to - from) * t);
                contentView.setAlpha(collapsed
                    ? 1f - clamp01(t / 0.5f)
                    : clamp01((t - 0.5f) / 0.5f));
                try {
                    contentWm.updateViewLayout(contentView, params);
                } catch (Exception ignored) {
                    // Finestra rimossa nel frattempo (es. hide() durante l'animazione) - non critico.
                }
            });
            anim.addListener(new AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(Animator animation) {
                    if (collapsed) contentView.setVisibility(View.GONE);
                }
            });
            anim.start();
        } catch (Exception e) {
            Log.e(TAG, "Errore nel collassare/espandere la barra di stato", e);
            if (logger != null) {
                logger.accept("Barra di stato: errore nel collassare/espandere (" + e + causeChain(e) + ")");
            }
        }
    }

    // No-op se non attualmente visibile - chiamato ad ogni tick di poll VDB da
    // TrackingService, molto piu' frequente di quanto serva ricreare la finestra. Aggiorna i
    // testi anche da collassata, cosi' i valori sono gia' corretti quando si riespande.
    public static void update(Context ctx, String km, String fuel, String consumption,
                               int flowColor, String flowLabel, String regenLabel) {
        if (contentView == null) return;
        ((TextView) contentView.findViewById(R.id.tv_status_bar_km)).setText(km);
        ((TextView) contentView.findViewById(R.id.tv_status_bar_fuel)).setText(fuel);
        ((TextView) contentView.findViewById(R.id.tv_status_bar_consumption)).setText(consumption);
        View dot = contentView.findViewById(R.id.dot_status_bar_flow);
        Drawable dotBg = dot.getBackground();
        if (dotBg != null) {
            dotBg = dotBg.mutate();
            dot.setBackground(dotBg);
            dotBg.setTint(flowColor);
        }
        ((TextView) contentView.findViewById(R.id.tv_status_bar_flow)).setText(flowLabel);
        ((TextView) contentView.findViewById(R.id.tv_status_bar_regen)).setText(regenLabel);
    }

    private static int dp(Context ctx, int value) {
        return (int) (value * ctx.getResources().getDisplayMetrics().density);
    }

    private static float clamp01(float v) {
        return Math.max(0f, Math.min(1f, v));
    }

    // Concatena i messaggi di ogni "Caused by" - un InflateException da solo e' quasi sempre
    // inutile (vedi commento nel catch di show()), la causa vera puo' essere annidata anche
    // 2-3 livelli sotto (es. LayoutInflater -> ImageView -> risoluzione attributo di tema).
    private static String causeChain(Throwable t) {
        StringBuilder sb = new StringBuilder();
        Throwable cause = t.getCause();
        while (cause != null) {
            sb.append(" <- ").append(cause);
            cause = cause.getCause();
        }
        return sb.toString();
    }
}
