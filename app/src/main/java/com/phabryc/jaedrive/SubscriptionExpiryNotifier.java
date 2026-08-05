package com.phabryc.jaedrive;

import android.content.Context;
import android.provider.Settings;
import android.util.Log;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

// Avviso "il tuo abbonamento sta per scadere" (2026-08-04, richiesta esplicita utente) -
// popup overlay (stesso meccanismo di OverlayPopup, funziona anche con l'app in background/
// chiusa, chiamato da SyncWorker subito dopo un heartbeat riuscito - vedi SyncWorker.doWork())
// quando mancano <=10 giorni alla scadenza di un abbonamento ATTIVO. Due bottoni: "OK" chiude
// solo per ora (ricompare al prossimo check, tipicamente il prossimo avvio/viaggio), "Non
// ricordare piu'" silenzia PER QUESTO specifico expiresAt - se l'utente rinnova (nuova data),
// il popup torna eleggibile invece di restare silenziato per sempre da una vecchia scelta.
public class SubscriptionExpiryNotifier {

    private static final String TAG = "JaeDrive-SubExpiry";
    private static final long WARNING_WINDOW_DAYS = 10;

    public static void checkAndNotify(Context ctx, CloudApiClient.SubscriptionInfo sub) {
        if (sub == null || !sub.isActive || sub.expiresAt == null) return;
        if (!Settings.canDrawOverlays(ctx)) return; // stesso guard di OverlayPopup/StatusBarOverlay

        Long expiresAtMillis = parseIso(sub.expiresAt);
        if (expiresAtMillis == null) return;

        long daysRemaining = (expiresAtMillis - System.currentTimeMillis()) / (24L * 60 * 60 * 1000);
        if (daysRemaining < 0 || daysRemaining > WARNING_WINDOW_DAYS) return;

        // "Non ricordare piu'" e' specifico di QUESTA data di scadenza (vedi commento in
        // cima al file) - non un booleano semplice.
        if (sub.expiresAt.equals(Prefs.getSubExpiryWarningDismissedFor(ctx))) return;

        String dateLabel = formatDate(expiresAtMillis);
        String message = ctx.getString(R.string.popup_subscription_expiring, daysRemaining, dateLabel);
        OverlayPopup.showActionPopup(ctx, message,
            new String[]{ctx.getString(R.string.btn_ok), ctx.getString(R.string.btn_dont_remind_again)},
            new Runnable[]{
                () -> {}, // OK: nessun flag persistito, ricompare al prossimo check
                () -> Prefs.setSubExpiryWarningDismissedFor(ctx, sub.expiresAt)
            });
    }

    // Il server manda sempre millisecondi (vedi ANDROID_SUBSCRIPTION_HANDSHAKE.md, es.
    // "2027-08-04T22:30:00.000Z") ma si prova comunque un fallback senza millis - un formato
    // non riconosciuto non deve mai far crashare l'heartbeat, solo saltare l'avviso.
    // Non-private: riusato da MainActivity.formatSubscriptionDate() per il badge tier nella
    // card CLOUD, stesso parsing, niente da duplicare.
    static Long parseIso(String iso) {
        for (String pattern : new String[]{"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'"}) {
            try {
                SimpleDateFormat fmt = new SimpleDateFormat(pattern, Locale.US);
                fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
                return fmt.parse(iso).getTime();
            } catch (ParseException ignored) {
                // Si prova il pattern successivo.
            }
        }
        Log.w(TAG, "expiresAt non riconosciuto, avviso scadenza saltato: " + iso);
        return null;
    }

    // dd/MM/yyyy fisso (non locale-dipendente) - stesso formato indicato esplicitamente in
    // ANDROID_SUBSCRIPTION_HANDSHAKE.md per il badge abbonamento, riusato qui per coerenza.
    static String formatDate(long millis) {
        SimpleDateFormat fmt = new SimpleDateFormat("dd/MM/yyyy", Locale.US);
        return fmt.format(new java.util.Date(millis));
    }
}
