import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { logger } from '../../../../lib/logger.js';

/**
 * Expo Push Notifications Provider (TRD section 2, 8.2)
 * Free push notifications with Firebase FCM credentials on the free Spark plan.
 */
export class ExpoPushProvider {
  private readonly expo = new Expo();

  async sendPushNotification(
    pushToken: string,
    payload: { title: string; body: string; data?: Record<string, unknown> }
  ): Promise<{ success: boolean; ticketId?: string; error?: string }> {
    if (!Expo.isExpoPushToken(pushToken)) {
      logger.warn({ token: pushToken }, 'Invalid Expo push token');
      return { success: false, error: 'Invalid push token' };
    }

    const messages: ExpoPushMessage[] = [
      {
        to: pushToken,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data,
        priority: 'high',
      },
    ];

    try {
      const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(messages);
      const ticket = tickets[0];
      if (ticket && ticket.status === 'ok') {
        return { success: true, ticketId: ticket.id };
      }
      return {
        success: false,
        error: ticket && ticket.status === 'error' ? ticket.message : 'Unknown ticket status',
      };
    } catch (err) {
      logger.error({ err }, 'Failed to send Expo push notification');
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Push delivery failed',
      };
    }
  }
}

export const expoPushProvider = new ExpoPushProvider();

