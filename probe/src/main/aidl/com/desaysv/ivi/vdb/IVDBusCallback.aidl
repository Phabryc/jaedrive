package com.desaysv.ivi.vdb;

import com.desaysv.ivi.vdb.event.VDEvent;

interface IVDBusCallback {
    void onVDBusCallback(in VDEvent event);
    void onVDBusNotify(in VDEvent event);
}
