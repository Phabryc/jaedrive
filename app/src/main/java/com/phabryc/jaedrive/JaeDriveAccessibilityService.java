package com.phabryc.jaedrive;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;

import androidx.core.content.ContextCompat;

// Usato SOLO come "ancora" per l'avvio affidabile di TrackingService in background:
// gli Accessibility Service hanno un ciclo di vita gestito direttamente dal sistema
// (AccessibilityManagerService), che li ri-collega automaticamente ad ogni boot e dopo
// il kill del processo - molto piu' affidabile di un BroadcastReceiver su BOOT_COMPLETED,
// specialmente su ROM OEM senza un toggle "avvio automatico" dedicato. Stesso meccanismo
// che garantisce a DSA (com.vadimbrk.mycar, che dichiara BIND_ACCESSIBILITY_SERVICE) di
// avviarsi sempre senza problemi su questo veicolo.
//
// Non legge ne' interagisce con lo schermo: nessun evento reale viene gestito.
public class JaeDriveAccessibilityService extends AccessibilityService {

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        ContextCompat.startForegroundService(this, new Intent(this, TrackingService.class));
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Non necessario: il servizio serve solo da ancora per il ciclo di vita.
    }

    @Override
    public void onInterrupt() {
    }
}
