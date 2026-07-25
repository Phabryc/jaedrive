package com.phabryc.jaedrive;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.drawable.Drawable;
import android.util.AttributeSet;
import android.view.View;

import androidx.core.content.ContextCompat;

import java.util.Collections;
import java.util.List;

// Traccia GPS "schematica" del viaggio selezionato in Storico Viaggi: disegna la
// polilinea reale (lat/lon dal GPX) colorata per segmento in base al valore ENERGY_FLOW
// campionato in quel punto (vedi EnergyFlowUtil), su sfondo scuro, coerente con lo stile
// "Modern Glassmorphic" del design Aetheris Automotive. Non e' una mappa vera (nessuna
// tile OSM/Google Maps integrata) - solo il percorso reale, scalato per riempire la card.
public class TripTraceView extends View {

    private List<TripPoint> points = Collections.emptyList();
    private final Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint emptyTextPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    // Stesse icone (e stesso significato) usate nella riga indirizzi del dettaglio viaggio
    // e nella mappa OSM online (vedi MainActivity.buildTripMarker()) - pin di partenza
    // (tinto), bandiera a scacchi di arrivo (mai tinta, il pattern bianco/nero e' il
    // punto). Caricate una volta sola, dimensione fissa in px.
    private final Drawable startIcon;
    private final Drawable endIcon;
    private final int markerSizePx;

    public TripTraceView(Context context, AttributeSet attrs) {
        super(context, attrs);
        linePaint.setStyle(Paint.Style.STROKE);
        linePaint.setStrokeWidth(dp(4));
        linePaint.setStrokeCap(Paint.Cap.ROUND);
        linePaint.setStrokeJoin(Paint.Join.ROUND);

        glowPaint.setStyle(Paint.Style.STROKE);
        glowPaint.setStrokeWidth(dp(14));
        glowPaint.setStrokeCap(Paint.Cap.ROUND);
        glowPaint.setStrokeJoin(Paint.Join.ROUND);

        emptyTextPaint.setColor(0xFF888888);
        emptyTextPaint.setTextSize(sp(14));
        emptyTextPaint.setTextAlign(Paint.Align.CENTER);

        markerSizePx = (int) dp(28);
        Drawable pin = ContextCompat.getDrawable(context, R.drawable.ic_location);
        startIcon = pin != null ? pin.mutate() : null;
        if (startIcon != null) startIcon.setTint(0xFF00BFFF);
        Drawable flag = ContextCompat.getDrawable(context, R.drawable.ic_flag_checkered);
        endIcon = flag != null ? flag.mutate() : null;
    }

    private float dp(float v) {
        return v * getResources().getDisplayMetrics().density;
    }

    private float sp(float v) {
        return v * getResources().getDisplayMetrics().scaledDensity;
    }

    public void setPoints(List<TripPoint> points) {
        this.points = points != null ? points : Collections.emptyList();
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (points.size() < 2) {
            canvas.drawText(points.isEmpty() ? "Nessuna traccia GPS salvata" : "Traccia troppo corta",
                getWidth() / 2f, getHeight() / 2f, emptyTextPaint);
            return;
        }

        double minLat = Double.MAX_VALUE, maxLat = -Double.MAX_VALUE;
        double minLon = Double.MAX_VALUE, maxLon = -Double.MAX_VALUE;
        for (TripPoint p : points) {
            minLat = Math.min(minLat, p.lat);
            maxLat = Math.max(maxLat, p.lat);
            minLon = Math.min(minLon, p.lon);
            maxLon = Math.max(maxLon, p.lon);
        }
        double latSpan = Math.max(maxLat - minLat, 1e-6);

        float pad = dp(28);
        float w = getWidth() - 2 * pad;
        float h = getHeight() - 2 * pad;

        // Corregge la distorsione longitudine/latitudine in base alla latitudine media,
        // cosi' la forma del percorso non risulta "stirata" est-ovest.
        double latRad = Math.toRadians((minLat + maxLat) / 2.0);
        double lonScale = Math.cos(latRad);
        double lonSpan = Math.max((maxLon - minLon) * lonScale, 1e-6);
        double scale = Math.min(w / lonSpan, h / latSpan);

        float cx = getWidth() / 2f;
        float cy = getHeight() / 2f;
        double midLat = (minLat + maxLat) / 2.0;
        double midLon = (minLon + maxLon) / 2.0;

        float[] xs = new float[points.size()];
        float[] ys = new float[points.size()];
        for (int i = 0; i < points.size(); i++) {
            TripPoint p = points.get(i);
            xs[i] = cx + (float) ((p.lon - midLon) * lonScale * scale);
            ys[i] = cy - (float) ((p.lat - midLat) * scale); // lat cresce a nord = verso l'alto
        }

        // Ogni segmento e' colorato in base all'ENERGY_FLOW campionato nel punto di
        // partenza del segmento (vedi EnergyFlowUtil.colorFor()).
        for (int i = 0; i < xs.length - 1; i++) {
            int color = EnergyFlowUtil.colorFor(points.get(i).energyFlow);
            glowPaint.setColor((color & 0x00FFFFFF) | 0x33000000);
            linePaint.setColor(color);
            canvas.drawLine(xs[i], ys[i], xs[i + 1], ys[i + 1], glowPaint);
            canvas.drawLine(xs[i], ys[i], xs[i + 1], ys[i + 1], linePaint);
        }

        // anchorX 0.5 = punta al centro (pin), 0.19 = punta sul lato sinistro (base
        // dell'asta della bandiera, vedi ic_flag_checkered.xml) - stessa logica di
        // ancoraggio usata per i marker sulla mappa OSM online.
        drawMarker(canvas, startIcon, xs[0], ys[0], 0.5f);
        drawMarker(canvas, endIcon, xs[xs.length - 1], ys[ys.length - 1], 0.19f);
    }

    private void drawMarker(Canvas canvas, Drawable icon, float x, float y, float anchorXFraction) {
        if (icon == null) return;
        int left = (int) (x - markerSizePx * anchorXFraction);
        int top = (int) (y - markerSizePx);
        icon.setBounds(left, top, left + markerSizePx, top + markerSizePx);
        icon.draw(canvas);
    }
}
