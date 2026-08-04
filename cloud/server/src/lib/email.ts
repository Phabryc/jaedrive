import { env } from "../env.js";

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
