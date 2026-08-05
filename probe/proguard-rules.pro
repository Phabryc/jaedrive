# AIDL/Parcelable generati per il bus VDB Desay - Stub/Proxy e CREATOR non vanno rinominati
# ne' rimossi, altrimenti il binding al servizio o la (de)serializzazione fallisce a runtime
# senza errori di compilazione (vedi VDEvent.java, copiato a mano dal modulo app/).
-keep class com.desaysv.ivi.vdb.** { *; }
-keep class com.desaysv.ivi.vdb.event.** { *; }

# Libreria terza per lo zip protetto da password - non serve offuscarla, basta che lo
# shrinking aggressivo non la rompa.
-keep class net.lingala.zip4j.** { *; }
-dontwarn net.lingala.zip4j.**
