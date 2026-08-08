# AIDL/Parcelable generati per il bus VDB Desay - Stub/Proxy e CREATOR non vanno rinominati
# ne' rimossi, altrimenti il binding al servizio o la (de)serializzazione fallisce a runtime
# senza errori di compilazione (stesse regole gia' usate in probe/proguard-rules.pro).
-keep class com.desaysv.ivi.vdb.** { *; }
-keep class com.desaysv.ivi.vdb.event.** { *; }

# WorkManager (SyncWorker) - istanziato per riflessione dal nome classe persistito nel suo
# database interno, non dichiarato in AndroidManifest.xml (quindi non coperto dalle regole
# di default di AGP che tengono solo i componenti manifest). Se rinominato, SyncWorker
# smette silenziosamente di partire dopo un riavvio/kill del processo.
-keep class com.phabryc.jaedrive.SyncWorker { *; }

# TripTraceView - referenziata per nome-classe completo da activity_track_detail.xml,
# LayoutInflater la risolve a runtime con Class.forName(): se rinominata l'inflate del
# layout lancia InflateException.
-keep class com.phabryc.jaedrive.TripTraceView { *; }

# osmdroid (mappa OpenStreetMap nel dettaglio viaggio) - libreria terza con le sue stesse
# regole consigliate dal progetto upstream, tenuta intera per evitare rotture silenziose
# nel caching/parsing dei tile che sarebbero difficili da notare senza un giro di test
# manuale completo su mappa reale dopo ogni build release.
-keep class org.osmdroid.** { *; }
-dontwarn org.osmdroid.**

# ZXing (encoder QR per il codice di pairing) - libreria terza, nota per rotture silenziose
# con shrinking aggressivo su alcuni enum interni.
-keep class com.google.zxing.** { *; }
-dontwarn com.google.zxing.**
