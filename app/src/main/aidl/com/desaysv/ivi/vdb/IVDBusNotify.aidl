package com.desaysv.ivi.vdb;

import com.desaysv.ivi.vdb.event.VDEvent;

interface IVDBusNotify {
    void onVDBusNotify(in VDEvent event);
}
