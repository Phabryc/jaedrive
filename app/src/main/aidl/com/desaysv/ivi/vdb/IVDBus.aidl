package com.desaysv.ivi.vdb;

import com.desaysv.ivi.vdb.event.VDEvent;
import com.desaysv.ivi.vdb.IVDBusCallback;
import com.desaysv.ivi.vdb.IVDBusNotify;

// Ricostruita per compatibilita' binaria dal protocollo reale del bus VDB
// Desay (ordine metodi verificato dai TRANSACTION_* nel Stub decompilato:
// get=1, set=2, subscribe=3, subscribeCustomizedEvent=4, unsubscribeCustomizedEvent=5).
interface IVDBus {
    VDEvent get(in VDEvent event);
    void set(in VDEvent event);
    void subscribe(in int[] ids, int flag, String clientName, IVDBusCallback callback);
    void subscribeCustomizedEvent(in VDEvent event, IVDBusNotify notify);
    void unsubscribeCustomizedEvent(in VDEvent event, IVDBusNotify notify);
}
