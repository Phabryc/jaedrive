import { env } from "../env.js";
import {
  type Language,
  buildSubActivatedEmail,
  buildSubRenewedEmail,
  buildSubExpiringEmail,
  buildSubExpiredEmail,
  buildNewPairingEmail,
  buildVehicleDeletedEmail,
  buildAccountDeletedEmail,
  buildDiscountCodeEmail,
} from "./emailTemplates.js";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!env.resendApiKey) {
    console.log(`[EMAIL LOGGER] Sending email to ${to}`);
    console.log(`[EMAIL LOGGER] Subject: ${subject}`);
    console.log(`[EMAIL LOGGER] HTML: ${html}`);
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.fromEmail,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[EMAIL ERROR] Failed to send email to ${to}: ${response.status} ${errorBody}`);
    }
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send email to ${to}:`, err);
  }
}

export type EmailTemplateType =
  | "SUBSCRIPTION_ACTIVATED"
  | "SUBSCRIPTION_RENEWED"
  | "SUBSCRIPTION_EXPIRING"
  | "SUBSCRIPTION_EXPIRED"
  | "PAIRING_NEW_VEHICLE"
  | "VEHICLE_DELETED"
  | "ACCOUNT_DELETED"
  | "DISCOUNT_CODE_ASSIGNED";

export async function sendTransactionalEmail(
  type: EmailTemplateType,
  to: string,
  params: {
    lang?: Language;
    name?: string | null;
    tier?: string;
    expiresAt?: string | null;
    daysLeft?: number;
    vehicleName?: string;
    vin?: string | null;
    code?: string;
    discountType?: string;
    value?: number;
  }
) {
  const lang: Language = params.lang ?? "it";
  let payload: { subject: string; html: string };

  switch (type) {
    case "SUBSCRIPTION_ACTIVATED":
      payload = buildSubActivatedEmail({ lang, name: params.name, tier: params.tier ?? "STANDARD", expiresAt: params.expiresAt });
      break;
    case "SUBSCRIPTION_RENEWED":
      payload = buildSubRenewedEmail({ lang, name: params.name, tier: params.tier ?? "STANDARD", expiresAt: params.expiresAt });
      break;
    case "SUBSCRIPTION_EXPIRING":
      payload = buildSubExpiringEmail({ lang, name: params.name, daysLeft: params.daysLeft ?? 10, expiresAt: params.expiresAt });
      break;
    case "SUBSCRIPTION_EXPIRED":
      payload = buildSubExpiredEmail({ lang, name: params.name });
      break;
    case "PAIRING_NEW_VEHICLE":
      payload = buildNewPairingEmail({ lang, name: params.name, vehicleName: params.vehicleName ?? "Jaecoo / Omoda", vin: params.vin });
      break;
    case "VEHICLE_DELETED":
      payload = buildVehicleDeletedEmail({ lang, name: params.name, vehicleName: params.vehicleName ?? "Jaecoo / Omoda", vin: params.vin });
      break;
    case "ACCOUNT_DELETED":
      payload = buildAccountDeletedEmail({ lang, name: params.name });
      break;
    case "DISCOUNT_CODE_ASSIGNED":
      payload = buildDiscountCodeEmail({
        lang,
        name: params.name,
        code: params.code ?? "PROMO2026",
        discountType: params.discountType ?? "FREE_DAYS",
        value: params.value ?? 30,
      });
      break;
    default:
      throw new Error(`Unknown email template type: ${type}`);
  }

  await sendEmail({ to, subject: payload.subject, html: payload.html });
  return payload;
}
