import { z } from 'zod';
import { AddGuardianBody, RemoveGuardianParams } from '@workspace/api-zod';

export const addGuardianSchema = AddGuardianBody.extend({
  name: z
    .string()
    .trim()
    .min(1, 'Guardian name is required')
    .max(120, 'Guardian name must be 120 characters or fewer'),
  phoneE164: z
    .string()
    .trim()
    .regex(/^\+[0-9]{7,15}$/, 'Phone number must be in E.164 format (e.g. +919876543210)'),
  relationship: z
    .string()
    .trim()
    .min(1, 'Relationship is required')
    .max(64, 'Relationship must be 64 characters or fewer'),
  channels: z
    .array(z.enum(['sms', 'telegram', 'email']))
    .min(1, 'At least one notification channel must be selected'),
  email: z.string().trim().email('Invalid email address').optional(),
}).strip();

export type AddGuardianInput = z.infer<typeof addGuardianSchema>;

export const removeGuardianParamsSchema = RemoveGuardianParams;
export type RemoveGuardianParamsInput = z.infer<typeof removeGuardianParamsSchema>;

