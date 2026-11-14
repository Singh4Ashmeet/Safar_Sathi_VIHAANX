import { z } from 'zod';

/**
 * Normalize Indian / international phone input to E.164 format (+91 default).
 * Strips spaces, dashes, parentheses, and leading zero.
 */
export function normalizePhoneE164(raw: string, defaultCountryCode = '+91'): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  if (!digits) {
    throw new Error('Phone number is empty');
  }

  let e164: string;
  if (hasPlus) {
    e164 = `+${digits}`;
  } else if (digits.length === 10) {
    e164 = `${defaultCountryCode}${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    e164 = `${defaultCountryCode}${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    e164 = `+${digits}`;
  } else {
    e164 = `+${digits}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    throw new Error(`Invalid E.164 phone number: ${raw}`);
  }
  return e164;
}

export const phoneE164Schema = z
  .string()
  .transform((val, ctx) => {
    try {
      return normalizePhoneE164(val);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'Invalid phone number',
      });
      return z.NEVER;
    }
  });

