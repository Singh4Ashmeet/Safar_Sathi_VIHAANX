/**
 * Frozen notification content per PRD / TRD section 9.3.
 * English + Hindi lines. Never include raw coordinates in notifications.
 */

export interface NotificationPayload {
  userName: string;
  trackingUrl: string;
  sosId?: string;
}

/**
 * Minimal notification payload for pending guardians (no tracking URL).
 */
export interface MinimalNotificationPayload {
  userName: string;
  sosId?: string;
}

export const NOTIFICATION_TEMPLATES = {
  // To user lock-screen (strictly neutral per TRD 9.3 / T2 to protect under duress)
  USER_LOCK_SCREEN: {
    title: 'SafarSaathi',
    body: 'Reminder',
  },

  // To guardians via SMS (English + Hindi line) — FULL alert with tracking URL
  GUARDIAN_SMS: (data: NotificationPayload): string =>
    `SafarSaathi alert: ${data.userName} may need help. Live location: ${data.trackingUrl}\n` +
    `सफ़रसाथी अलर्ट: ${data.userName} को सहायता की आवश्यकता हो सकती है। लाइव लोकेशन: ${data.trackingUrl}\n` +
    `Reply is not monitored. If urgent call 112. / आपातकाल में 112 डायल करें।`,

  // To guardians via Telegram — FULL alert with tracking URL
  GUARDIAN_TELEGRAM: (data: NotificationPayload): string =>
    `🚨 *SafarSaathi Alert*\n\n` +
    `*${data.userName}* may need help.\n` +
    `Live location: ${data.trackingUrl}\n\n` +
    `सफ़रसाथी अलर्ट: *${data.userName}* को सहायता की आवश्यकता हो सकती है।\n` +
    `लाइव लोकेशन: ${data.trackingUrl}\n\n` +
    `_If urgent call 112._`,

  // To guardians via Email — FULL alert with tracking URL
  GUARDIAN_EMAIL: (data: NotificationPayload) => ({
    subject: `SafarSaathi Alert: ${data.userName} needs attention`,
    text:
      `SafarSaathi alert: ${data.userName} may need help.\n` +
      `Live location: ${data.trackingUrl}\n\n` +
      `सफ़रसाथी अलर्ट: ${data.userName} को सहायता की आवश्यकता हो सकती है।\n` +
      `लाइव लोकेशन: ${data.trackingUrl}\n\n` +
      `If urgent call 112. / आपातकाल में 112 डायल करें।`,
  }),

  // To guardians via Expo Push Notification (includes deep link) — FULL alert
  GUARDIAN_PUSH: (data: NotificationPayload) => ({
    title: `SafarSaathi Alert: ${data.userName}`,
    body: `${data.userName} may need help. Tap to view live location.`,
    data: {
      url: data.sosId ? `safarsaathi://sos/${data.sosId}` : data.trackingUrl,
      trackingUrl: data.trackingUrl,
      sosId: data.sosId,
    },
  }),

  // ========================================================================
  // MINIMAL ALERTS (for pending guardians — NO tracking URL)
  // ========================================================================

  // Minimal SMS alert (no tracking URL)
  GUARDIAN_SMS_MINIMAL: (data: MinimalNotificationPayload): string =>
    `SafarSaathi alert: ${data.userName} may need help.\n` +
    `सफ़रसाथी अलर्ट: ${data.userName} को सहायता की आवश्यकता हो सकती है।\n` +
    `Reply is not monitored. If urgent call 112. / आपातकाल में 112 डायल करें।`,

  // Minimal Telegram alert (no tracking URL)
  GUARDIAN_TELEGRAM_MINIMAL: (data: MinimalNotificationPayload): string =>
    `🚨 *SafarSaathi Alert*\n\n` +
    `*${data.userName}* may need help.\n\n` +
    `सफ़रसाथी अलर्ट: *${data.userName}* को सहायता की आवश्यकता हो सकती है।\n\n` +
    `_If urgent call 112._`,

  // Minimal Email alert (no tracking URL)
  GUARDIAN_EMAIL_MINIMAL: (data: MinimalNotificationPayload) => ({
    subject: `SafarSaathi Alert: ${data.userName} needs attention`,
    text:
      `SafarSaathi alert: ${data.userName} may need help.\n` +
      `सफ़रसाथी अलर्ट: ${data.userName} को सहायता की आवश्यकता हो सकती है।\n\n` +
      `If urgent call 112. / आपातकाल में 112 डायल करें।`,
  }),

  // Minimal Push Notification (no tracking URL in data)
  GUARDIAN_PUSH_MINIMAL: (data: MinimalNotificationPayload) => ({
    title: `SafarSaathi Alert: ${data.userName}`,
    body: `${data.userName} may need help.`,
    data: {
      sosId: data.sosId,
    },
  }),
};

