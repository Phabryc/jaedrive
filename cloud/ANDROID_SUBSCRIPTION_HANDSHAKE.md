# JaeDrive Android Headunit - Subscription & Sync Integration Guide

This document outlines the API contracts, response payloads, and data flow for the Android Headunit App to sync trip data and display Cloud subscription status (FREE vs PREMIUM, Tier, Expiration Date).

---

## 1. Overview of Subscription Tiers & Behavior

The JaeDrive Cloud supports two subscription statuses and two tiers:

- **Status**:
  - `FREE`: Cloud features disabled. Trip sync will return `403 SUBSCRIPTION_REQUIRED`.
  - `PREMIUM`: Active subscription with full cloud sync enabled.
- **Tiers**:
  - `STANDARD`: Allows 1 active vehicle in garage, max 2 distinct Headunit swaps per 365 days.
  - `GARAGE`: Allows 3 active vehicles in garage, max 5 distinct Headunit swaps per 365 days.

---

## 2. API Endpoints & Response Contracts for Android App

### A. Device Owner Info: `GET /api/device/owner`
**Headers**: `Authorization: Bearer <deviceToken>`

**Response Payload (`200 OK`)**:
```json
{
  "firstName": "Mario",
  "lastName": "Rossi",
  "email": "mario.rossi@example.com",
  "photoUrl": "https://lh3.googleusercontent.com/a/...",
  "subscription": {
    "status": "PREMIUM",
    "tier": "STANDARD",
    "expiresAt": "2027-08-04T22:30:00.000Z",
    "isActive": true
  }
}
```

If the account is on the `FREE` tier, `subscription` will return:
```json
{
  "firstName": "Mario",
  "lastName": "Rossi",
  "email": "mario.rossi@example.com",
  "photoUrl": null,
  "subscription": {
    "status": "FREE",
    "tier": "STANDARD",
    "expiresAt": null,
    "isActive": false
  }
}
```

---

### B. Device Heartbeat & Sync Check: `POST /api/device/heartbeat`
**Headers**: `Authorization: Bearer <deviceToken>`

**Response Payload (`200 OK`)**:
```json
{
  "ok": true,
  "subscription": {
    "status": "PREMIUM",
    "tier": "GARAGE",
    "expiresAt": "2027-12-31T23:59:59.000Z",
    "isActive": true
  }
}
```

---

### C. Trip Sync / Upload: `POST /api/device/trips`
**Headers**: `Authorization: Bearer <deviceToken>`

**Success (`200 OK`)**:
```json
{
  "tripId": "c0a80101-0000-0000-0000-000000000001"
}
```

**Subscription Expired or Required Error (`403 Forbidden`)**:
```json
{
  "error": "SUBSCRIPTION_REQUIRED"
}
```

> **Android Action on 403 `SUBSCRIPTION_REQUIRED`**:
> 1. Mark local sync status as "Paused / Subscription Required".
> 2. Display a banner in the app: *"Cloud Sync Paused - Active Premium Subscription Required. Manage subscription or redeem promo code at jaedrive.com/settings"*.
> 3. Retry when `heartbeat` or `owner` indicates `subscription.isActive === true`.

---

## 3. Recommended Android Implementation Flow

### 1. Data Model (Kotlin Data Classes)
```kotlin
data class SubscriptionInfo(
    val status: String,      // "FREE" or "PREMIUM"
    val tier: String,        // "STANDARD" or "GARAGE"
    val expiresAt: String?,  // ISO 8601 string or null
    val isActive: Boolean    // Convenience flag (status == "PREMIUM" && not expired)
)

data class DeviceOwnerResponse(
    val firstName: String?,
    val lastName: String?,
    val email: String?,
    val photoUrl: String?,
    val subscription: SubscriptionInfo?
)

data class HeartbeatResponse(
    val ok: Boolean,
    val subscription: SubscriptionInfo?
)
```

### 2. UI Updates in Android Settings ("CLOUD" Card)
In the Android app's Settings screen:
- **Connected Account**: Show `firstName`, `lastName`, `email`, and `photoUrl`.
- **Subscription Badge**:
  - `PREMIUM STANDARD`: Green badge, show expiration date formatted in local format (`dd/MM/yyyy`).
  - `PREMIUM GARAGE`: Emerald badge with 3-car garage icon.
  - `FREE`: Orange/Gray badge *"Free Plan (Cloud Sync Inactive)"*.
- **Action Button**: Provide a QR Code or link to `https://jaedrive.com/settings` to renew or enter promo codes.
