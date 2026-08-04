export type Language = "it" | "en";

export interface EmailPayload {
  subject: string;
  html: string;
}

function wrapEmailHtml(contentHtml: string, lang: Language): string {
  const footerText =
    lang === "it"
      ? "JaeDrive · Telemetria ed Analisi per Veicoli Jaecoo e Omoda.<br/>Puoi gestire le tue preferenze su <a href=\"https://jaedrive.com/settings\" style=\"color:#00BFFF;text-decoration:none;\">jaedrive.com/settings</a>."
      : "JaeDrive · Telemetry & Analytics for Jaecoo and Omoda Vehicles.<br/>Manage your preferences at <a href=\"https://jaedrive.com/settings\" style=\"color:#00BFFF;text-decoration:none;\">jaedrive.com/settings</a>.";

  return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JaeDrive</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0C10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#E5E2E1;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0A0C10;padding:30px 10px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#14171E;border:1px solid #262B36;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
          <!-- HEADER -->
          <tr>
            <td style="background-color:#0F1218;padding:24px 30px;border-bottom:2px solid #00BFFF;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">
                      Jae<span style="color:#00BFFF;">Drive</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8FD6FF;background:rgba(0,191,255,0.12);padding:4px 10px;border-radius:6px;border:1px solid rgba(0,191,255,0.25);">
                      Cloud Telemetry
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY CONTENT -->
          <tr>
            <td style="padding:32px 30px;line-height:1.6;font-size:15px;color:#CBD5E1;">
              ${contentHtml}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#0F1218;padding:20px 30px;border-top:1px solid #262B36;text-align:center;font-size:12px;color:#64748B;line-height:1.5;">
              ${footerText}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

// 1. ABBONAMENTO ATTIVO
export function buildSubActivatedEmail({
  lang = "it",
  name,
  tier,
  expiresAt,
}: {
  lang?: Language;
  name?: string | null;
  tier: string;
  expiresAt?: string | null;
}): EmailPayload {
  const isIt = lang === "it";
  const greeting = name ? `${isIt ? "Ciao" : "Hello"} ${name},` : isIt ? "Ciao," : "Hello,";
  const subject = isIt ? "🎉 Il tuo abbonamento Premium JaeDrive è attivo!" : "🎉 Your JaeDrive Premium subscription is active!";
  const expiresText = expiresAt ? new Date(expiresAt).toLocaleDateString(isIt ? "it-IT" : "en-US") : isIt ? "A vita ∞ (Nessuna scadenza)" : "Lifetime ∞ (No expiration)";

  const content = `
    <p style="font-size:18px;font-weight:700;color:#FFFFFF;margin-top:0;">${greeting}</p>
    <p>${isIt ? "Il tuo abbonamento JaeDrive Cloud Premium è stato attivato con successo! Ora hai accesso completo alla sincronizzazione remota dei viaggi ed alla telemetria del tuo veicolo." : "Your JaeDrive Cloud Premium subscription has been successfully activated! You now have full access to remote trip sync and vehicle telemetry."}</p>

    <div style="background-color:#1C212C;border:1px solid #2D3545;border-radius:12px;padding:20px;margin:24px 0;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:#94A3B8;">${isIt ? "Stato Abbonamento:" : "Subscription Status:"}</td>
          <td align="right" style="padding:6px 0;font-weight:700;color:#34D399;">PREMIUM</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#94A3B8;">${isIt ? "Piano Garage:" : "Garage Plan:"}</td>
          <td align="right" style="padding:6px 0;font-weight:700;color:#FFFFFF;">${tier}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#94A3B8;">${isIt ? "Scadenza:" : "Expiration:"}</td>
          <td align="right" style="padding:6px 0;font-weight:700;color:#00BFFF;">${expiresText}</td>
        </tr>
      </table>
    </div>

    <p style="text-align:center;margin-top:30px;">
      <a href="https://jaedrive.com/dashboard" style="display:inline-block;background-color:#00BFFF;color:#001824;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;">
        ${isIt ? "Vai alla Dashboard" : "Go to Dashboard"}
      </a>
    </p>
  `;

  return { subject, html: wrapEmailHtml(content, lang) };
}

// 2. ABBONAMENTO RINNOVATO
export function buildSubRenewedEmail({
  lang = "it",
  name,
  tier,
  expiresAt,
}: {
  lang?: Language;
  name?: string | null;
  tier: string;
  expiresAt?: string | null;
}): EmailPayload {
  const isIt = lang === "it";
  const greeting = name ? `${isIt ? "Ciao" : "Hello"} ${name},` : isIt ? "Ciao," : "Hello,";
  const subject = isIt ? "✨ Il tuo abbonamento JaeDrive è stato rinnovato!" : "✨ Your JaeDrive subscription has been renewed!";
  const expiresText = expiresAt ? new Date(expiresAt).toLocaleDateString(isIt ? "it-IT" : "en-US") : isIt ? "A vita ∞ (Nessuna scadenza)" : "Lifetime ∞ (No expiration)";

  const content = `
    <p style="font-size:18px;font-weight:700;color:#FFFFFF;margin-top:0;">${greeting}</p>
    <p>${isIt ? "Il tuo abbonamento Premium è stato prorogato con successo. La sincronizzazione del tuo garage continuerà senza interruzioni!" : "Your Premium subscription has been successfully extended. Your garage sync will continue uninterrupted!"}</p>

    <div style="background-color:#1C212C;border:1px solid #2D3545;border-radius:12px;padding:20px;margin:24px 0;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:#94A3B8;">${isIt ? "Piano Attuale:" : "Current Plan:"}</td>
          <td align="right" style="padding:6px 0;font-weight:700;color:#FFFFFF;">PREMIUM ${tier}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#94A3B8;">${isIt ? "Nuova Scadenza:" : "New Expiration Date:"}</td>
          <td align="right" style="padding:6px 0;font-weight:700;color:#00BFFF;">${expiresText}</td>
        </tr>
      </table>
    </div>

    <p style="text-align:center;margin-top:30px;">
      <a href="https://jaedrive.com/settings" style="display:inline-block;background-color:#00BFFF;color:#001824;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;">
        ${isIt ? "Gestisci Abbonamento" : "Manage Subscription"}
      </a>
    </p>
  `;

  return { subject, html: wrapEmailHtml(content, lang) };
}

// 3. ABBONAMENTO IN SCADENZA (10 o 3 giorni prima)
export function buildSubExpiringEmail({
  lang = "it",
  name,
  daysLeft,
  expiresAt,
}: {
  lang?: Language;
  name?: string | null;
  daysLeft: number;
  expiresAt?: string | null;
}): EmailPayload {
  const isIt = lang === "it";
  const greeting = name ? `${isIt ? "Ciao" : "Hello"} ${name},` : isIt ? "Ciao," : "Hello,";
  const subject = isIt ? `⚠️ Il tuo abbonamento JaeDrive scade tra ${daysLeft} giorni` : `⚠️ Your JaeDrive subscription expires in ${daysLeft} days`;
  const expiresText = expiresAt ? new Date(expiresAt).toLocaleDateString(isIt ? "it-IT" : "en-US") : "—";

  const content = `
    <p style="font-size:18px;font-weight:700;color:#FFFFFF;margin-top:0;">${greeting}</p>
    <p>${isIt ? `Ti ricordiamo che il tuo abbonamento JaeDrive Premium scadrà tra **${daysLeft} giorni** (${expiresText}). Per evitare l'interruzione della sincronizzazione automatica dei viaggi dalla tua auto, rinnova prima della scadenza.` : `Reminder: your JaeDrive Premium subscription will expire in **${daysLeft} days** (${expiresText}). To prevent automatic trip sync interruption, renew before expiration.`}</p>

    <div style="background-color:#2D1B00;border:1px solid #F59E0B;border-radius:12px;padding:16px 20px;margin:24px 0;color:#FDE68A;">
      <p style="margin:0;font-weight:600;font-size:14px;">
        ${isIt ? "💡 Dopo la scadenza l'auto continuerà a registrare i viaggi in locale, ma l'invio al Cloud verrà messo in pausa." : "💡 After expiration, your vehicle will record trips locally, but Cloud sync will be paused."}
      </p>
    </div>

    <p style="text-align:center;margin-top:30px;">
      <a href="https://jaedrive.com/settings" style="display:inline-block;background-color:#F59E0B;color:#000000;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;">
        ${isIt ? "Rinnova Ora" : "Renew Now"}
      </a>
    </p>
  `;

  return { subject, html: wrapEmailHtml(content, lang) };
}

// 4. ABBONAMENTO SCADUTO
export function buildSubExpiredEmail({
  lang = "it",
  name,
}: {
  lang?: Language;
  name?: string | null;
}): EmailPayload {
  const isIt = lang === "it";
  const greeting = name ? `${isIt ? "Ciao" : "Hello"} ${name},` : isIt ? "Ciao," : "Hello,";
  const subject = isIt ? "❌ Il tuo abbonamento JaeDrive Premium è scaduto" : "❌ Your JaeDrive Premium subscription has expired";

  const content = `
    <p style="font-size:18px;font-weight:700;color:#FFFFFF;margin-top:0;">${greeting}</p>
    <p>${isIt ? "Il tuo abbonamento JaeDrive Premium è scaduto. La sincronizzazione dei viaggi con il Cloud è stata temporaneamente messa in pausa." : "Your JaeDrive Premium subscription has expired. Cloud trip synchronization has been temporarily paused."}</p>

    <div style="background-color:#2A1215;border:1px solid #EF4444;border-radius:12px;padding:20px;margin:24px 0;color:#FCA5A5;">
      <p style="margin:0;font-size:14px;line-height:1.5;">
        ${isIt ? "I tuoi dati storici e le auto nel garage rimangono al sicuro. Puoi riattivare la sincronizzazione in qualsiasi momento inserendo un codice promo o rinnovando l'abbonamento." : "Your historical data and vehicles remain safe. You can reactivate sync anytime by entering a promo code or renewing."}
      </p>
    </div>

    <p style="text-align:center;margin-top:30px;">
      <a href="https://jaedrive.com/settings" style="display:inline-block;background-color:#EF4444;color:#FFFFFF;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;">
        ${isIt ? "Riattiva Abbonamento" : "Reactivate Subscription"}
      </a>
    </p>
  `;

  return { subject, html: wrapEmailHtml(content, lang) };
}

// 5. NUOVO PAIRING DI UN'AUTO
export function buildNewPairingEmail({
  lang = "it",
  name,
  vehicleName,
  vin,
}: {
  lang?: Language;
  name?: string | null;
  vehicleName: string;
  vin?: string | null;
}): EmailPayload {
  const isIt = lang === "it";
  const greeting = name ? `${isIt ? "Ciao" : "Hello"} ${name},` : isIt ? "Ciao," : "Hello,";
  const subject = isIt ? `🚗 Nuova auto associata: ${vehicleName}` : `🚗 New car paired: ${vehicleName}`;

  const content = `
    <p style="font-size:18px;font-weight:700;color:#FFFFFF;margin-top:0;">${greeting}</p>
    <p>${isIt ? `Un nuovo veicolo è stato associato al tuo account JaeDrive Cloud!` : `A new vehicle has been paired with your JaeDrive Cloud account!`}</p>

    <div style="background-color:#1C212C;border:1px solid #2D3545;border-radius:12px;padding:20px;margin:24px 0;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:#94A3B8;">${isIt ? "Veicolo:" : "Vehicle:"}</td>
          <td align="right" style="padding:6px 0;font-weight:700;color:#00BFFF;">${vehicleName}</td>
        </tr>
        ${vin ? `
        <tr>
          <td style="padding:6px 0;color:#94A3B8;">VIN:</td>
          <td align="right" style="padding:6px 0;font-family:monospace;color:#FFFFFF;">${vin}</td>
        </tr>
        ` : ""}
        <tr>
          <td style="padding:6px 0;color:#94A3B8;">${isIt ? "Data Associazione:" : "Pairing Date:"}</td>
          <td align="right" style="padding:6px 0;color:#CBD5E1;">${new Date().toLocaleDateString(isIt ? "it-IT" : "en-US")}</td>
        </tr>
      </table>
    </div>

    <p style="text-align:center;margin-top:30px;">
      <a href="https://jaedrive.com/dashboard" style="display:inline-block;background-color:#00BFFF;color:#001824;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;">
        ${isIt ? "Vedi Veicolo in Dashboard" : "View Vehicle in Dashboard"}
      </a>
    </p>
  `;

  return { subject, html: wrapEmailHtml(content, lang) };
}

// 6. CANCELLAZIONE DELL'AUTO
export function buildVehicleDeletedEmail({
  lang = "it",
  name,
  vehicleName,
  vin,
}: {
  lang?: Language;
  name?: string | null;
  vehicleName: string;
  vin?: string | null;
}): EmailPayload {
  const isIt = lang === "it";
  const greeting = name ? `${isIt ? "Ciao" : "Hello"} ${name},` : isIt ? "Ciao," : "Hello,";
  const subject = isIt ? `🗑️ Veicolo rimosso dal garage: ${vehicleName}` : `🗑️ Vehicle removed from garage: ${vehicleName}`;

  const content = `
    <p style="font-size:18px;font-weight:700;color:#FFFFFF;margin-top:0;">${greeting}</p>
    <p>${isIt ? `Ti confermiamo che il veicolo **${vehicleName}** ${vin ? `(VIN: ${vin})` : ""} è stato rimosso dal tuo account JaeDrive.` : `We confirm that vehicle **${vehicleName}** ${vin ? `(VIN: ${vin})` : ""} has been removed from your JaeDrive account.`}</p>

    <div style="background-color:#1C212C;border:1px solid #2D3545;border-radius:12px;padding:16px 20px;margin:24px 0;color:#94A3B8;font-size:13px;">
      ${isIt ? "Se non sei stato tu ad effettuare questa operazione, ti invitiamo a contattare subito il supporto o modificare la password." : "If you did not perform this action, please contact support immediately or change your password."}
    </div>
  `;

  return { subject, html: wrapEmailHtml(content, lang) };
}

// 7. CANCELLAZIONE DELL'ACCOUNT
export function buildAccountDeletedEmail({
  lang = "it",
  name,
}: {
  lang?: Language;
  name?: string | null;
}): EmailPayload {
  const isIt = lang === "it";
  const greeting = name ? `${isIt ? "Ciao" : "Hello"} ${name},` : isIt ? "Ciao," : "Hello,";
  const subject = isIt ? "👋 Il tuo account JaeDrive è stato eliminato" : "👋 Your JaeDrive account has been deleted";

  const content = `
    <p style="font-size:18px;font-weight:700;color:#FFFFFF;margin-top:0;">${greeting}</p>
    <p>${isIt ? "Come da te richiesto, il tuo account JaeDrive e tutti i dati di telemetria, viaggi e veicoli associati sono stati permanentemente eliminati dai nostri sistemi." : "As requested, your JaeDrive account and all associated telemetry, trips, and vehicle data have been permanently deleted from our systems."}</p>

    <p>${isIt ? "Ci dispiace vederti andare via! Se in futuro vorrai tornare a sincronizzare la tua auto, potrai creare un nuovo account in qualsiasi momento." : "We're sorry to see you go! If you ever wish to return and sync your vehicle again, you can create a new account anytime."}</p>
  `;

  return { subject, html: wrapEmailHtml(content, lang) };
}

// 8. CODICE SCONTO AD PERSONAM
export function buildDiscountCodeEmail({
  lang = "it",
  name,
  code,
  discountType,
  value,
}: {
  lang?: Language;
  name?: string | null;
  code: string;
  discountType: string;
  value: number;
}): EmailPayload {
  const isIt = lang === "it";
  const greeting = name ? `${isIt ? "Ciao" : "Hello"} ${name},` : isIt ? "Ciao," : "Hello,";
  const subject = isIt ? `🎁 Hai ricevuto un codice promo esclusivo: ${code}` : `🎁 You received an exclusive promo code: ${code}`;

  let desc = "";
  if (discountType === "FREE_DAYS") desc = isIt ? `${value} giorni di abbonamento Premium gratis` : `${value} free Premium subscription days`;
  else if (discountType === "PERCENT") desc = isIt ? `${value}% di sconto` : `${value}% discount`;
  else desc = isIt ? `${value}€ di sconto` : `${value}€ discount`;

  const content = `
    <p style="font-size:18px;font-weight:700;color:#FFFFFF;margin-top:0;">${greeting}</p>
    <p>${isIt ? `Abbiamo creato un codice promo ad personam riservato a te per attivare o estendere il tuo abbonamento Premium!` : `We created a personalized promo code reserved for you to activate or extend your Premium subscription!`}</p>

    <div style="background-color:#0F172A;border:2px dashed #00BFFF;border-radius:14px;padding:24px;margin:24px 0;text-align:center;">
      <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">${isIt ? "IL TUO CODICE PROMO" : "YOUR PROMO CODE"}</p>
      <p style="margin:8px 0;font-family:monospace;font-size:28px;font-weight:800;color:#00BFFF;letter-spacing:3px;">${code}</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#E2E8F0;">${desc}</p>
    </div>

    <p style="text-align:center;margin-top:30px;">
      <a href="https://jaedrive.com/settings" style="display:inline-block;background-color:#00BFFF;color:#001824;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;">
        ${isIt ? "Riscatta Codice Ora" : "Redeem Code Now"}
      </a>
    </p>
  `;

  return { subject, html: wrapEmailHtml(content, lang) };
}
