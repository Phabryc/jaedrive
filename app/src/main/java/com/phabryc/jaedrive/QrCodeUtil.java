package com.phabryc.jaedrive;

import android.graphics.Bitmap;
import android.graphics.Color;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

// Genera un QR code come Bitmap per il dialogo di pairing (vedi MainActivity) - solo
// encoding, nessuna fotocamera/scansione coinvolta lato app (chi scansiona e' lo
// smartphone dell'utente, con la sua fotocamera di sistema). Richiede com.google.zxing:core
// in build.gradle.
public class QrCodeUtil {

    public static Bitmap encode(String content, int sizePx) {
        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx);
            Bitmap bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565);
            for (int x = 0; x < sizePx; x++) {
                for (int y = 0; y < sizePx; y++) {
                    bitmap.setPixel(x, y, matrix.get(x, y) ? Color.BLACK : Color.WHITE);
                }
            }
            return bitmap;
        } catch (Exception e) {
            return null;
        }
    }
}
