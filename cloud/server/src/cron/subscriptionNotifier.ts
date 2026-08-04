import { prisma } from "../db.js";
import { sendTransactionalEmail } from "../lib/email.js";

export async function checkAndNotifyExpiringSubscriptions() {
  try {
    const now = new Date();

    // 1. Mark expired subscriptions as FREE and send SUBSCRIPTION_EXPIRED email
    const expiredUsers = await prisma.user.findMany({
      where: {
        subscriptionStatus: "PREMIUM",
        subscriptionExpiresAt: {
          lt: now,
          not: null,
        },
      },
    });

    for (const u of expiredUsers) {
      await prisma.user.update({
        where: { id: u.id },
        data: { subscriptionStatus: "FREE" },
      });

      await prisma.subscriptionLog.create({
        data: {
          userId: u.id,
          status: "FREE",
          tier: u.subscriptionTier ?? "STANDARD",
          expiresAt: u.subscriptionExpiresAt,
          notes: "Abbonamento scaduto automaticamente",
        },
      });

      if (u.email) {
        const name = u.firstName ?? u.displayName ?? null;
        await sendTransactionalEmail("SUBSCRIPTION_EXPIRED", u.email, { name });
      }
    }

    // 2. Check 10-day expiration window (between 9.5 and 10.5 days from now)
    const tenDaysStart = new Date(now.getTime() + 9.5 * 24 * 60 * 60 * 1000);
    const tenDaysEnd = new Date(now.getTime() + 10.5 * 24 * 60 * 60 * 1000);

    const usersTenDays = await prisma.user.findMany({
      where: {
        subscriptionStatus: "PREMIUM",
        subscriptionExpiresAt: {
          gte: tenDaysStart,
          lte: tenDaysEnd,
        },
      },
    });

    for (const u of usersTenDays) {
      if (u.email) {
        const name = u.firstName ?? u.displayName ?? null;
        const expiresAt = u.subscriptionExpiresAt?.toISOString() ?? null;
        await sendTransactionalEmail("SUBSCRIPTION_EXPIRING", u.email, {
          name,
          daysLeft: 10,
          expiresAt,
        });
      }
    }

    // 3. Check 3-day expiration window (between 2.5 and 3.5 days from now)
    const threeDaysStart = new Date(now.getTime() + 2.5 * 24 * 60 * 60 * 1000);
    const threeDaysEnd = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000);

    const usersThreeDays = await prisma.user.findMany({
      where: {
        subscriptionStatus: "PREMIUM",
        subscriptionExpiresAt: {
          gte: threeDaysStart,
          lte: threeDaysEnd,
        },
      },
    });

    for (const u of usersThreeDays) {
      if (u.email) {
        const name = u.firstName ?? u.displayName ?? null;
        const expiresAt = u.subscriptionExpiresAt?.toISOString() ?? null;
        await sendTransactionalEmail("SUBSCRIPTION_EXPIRING", u.email, {
          name,
          daysLeft: 3,
          expiresAt,
        });
      }
    }
  } catch (err) {
    console.error("[CRON] Error checking subscription notifications:", err);
  }
}

export function startSubscriptionNotifierCron() {
  // Run once immediately on startup, then every 6 hours
  checkAndNotifyExpiringSubscriptions();
  setInterval(checkAndNotifyExpiringSubscriptions, 6 * 60 * 60 * 1000);
}
