export interface SendSmsOptions {
  toPhoneE164: string;
  messageText: string;
}

export interface SmsSendResult {
  success: boolean;
  providerRef?: string;
  error?: string;
}

export interface SmsProvider {
  readonly name: string;
  sendSms(options: SendSmsOptions): Promise<SmsSendResult>;
}

