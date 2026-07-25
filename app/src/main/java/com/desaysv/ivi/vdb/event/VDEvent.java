package com.desaysv.ivi.vdb.event;

import android.os.Bundle;
import android.os.Parcel;
import android.os.Parcelable;

// Ricostruita per compatibilita' binaria col VDEvent reale di Desay (verificato
// dal writeToParcel/costruttore(Parcel) decompilati): ordine sul wire e' esattamente
// id (int), payload (Bundle), threadType (int, default 0 = MAIN_THREAD), timeMillis (long).
public class VDEvent implements Parcelable {

    private int mId;
    private Bundle mPayload;
    private int mThreadType = 0; // VDThreadType.MAIN_THREAD
    private long mTimeMillis;

    public VDEvent(int id) {
        this.mId = id;
    }

    public VDEvent(int id, Bundle payload) {
        this.mId = id;
        this.mPayload = payload;
    }

    protected VDEvent(Parcel in) {
        mId = in.readInt();
        mPayload = in.readBundle(getClass().getClassLoader());
        mThreadType = in.readInt();
        mTimeMillis = in.readLong();
    }

    public int getId() {
        return mId;
    }

    public Bundle getPayload() {
        return mPayload;
    }

    public void setPayload(Bundle payload) {
        mPayload = payload;
    }

    public int getThreadType() {
        return mThreadType;
    }

    public long getTimeMillis() {
        return mTimeMillis;
    }

    @Override
    public int describeContents() {
        return 0;
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeInt(mId);
        dest.writeBundle(mPayload);
        dest.writeInt(mThreadType);
        dest.writeLong(mTimeMillis);
    }

    public static final Creator<VDEvent> CREATOR = new Creator<VDEvent>() {
        @Override
        public VDEvent createFromParcel(Parcel in) {
            return new VDEvent(in);
        }

        @Override
        public VDEvent[] newArray(int size) {
            return new VDEvent[size];
        }
    };
}
