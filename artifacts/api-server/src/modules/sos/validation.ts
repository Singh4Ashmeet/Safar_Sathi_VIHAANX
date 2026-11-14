import { z } from 'zod';
import {
  CreateSosBody,
  CancelSosBody,
  CancelSosParams,
  AcknowledgeSosBody,
  AcknowledgeSosParams,
  IngestSosLocationsParams,
  IngestSosLocationsBody,
  GetSosStatusParams,
} from '@workspace/api-zod';

export const createSosSchema = CreateSosBody.extend({
  sosId: z.string().uuid('sosId must be a valid UUID'),
  tripId: z.string().uuid('tripId must be a valid UUID').optional(),
  trigger: z.enum(['button', 'shake', 'prompt_timeout', 'watchdog', 'ble_relay']),
  duress: z.boolean(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    acc: z.number().min(0).optional(),
    ts: z.number().int().positive(),
    mocked: z.boolean().optional(),
  }).optional(),
  battery: z.number().int().min(0).max(100).optional(),
  createdAt: z.number().int().positive(),
}).strip();

export type CreateSosInput = z.infer<typeof createSosSchema>;

export const cancelSosSchema = CancelSosBody.extend({
  pinKind: z.enum(['cancel', 'duress']),
}).strip();

export type CancelSosInput = z.infer<typeof cancelSosSchema>;

export const cancelSosParamsSchema = CancelSosParams;
export type CancelSosParamsInput = z.infer<typeof cancelSosParamsSchema>;

// Base schema without the "either/or" refinement - validation done in service layer
export const acknowledgeSosSchema = z.object({
  guardianId: z.string().uuid('guardianId must be a valid UUID').optional(),
  token: z.string().optional(),
});

export type AcknowledgeSosInput = z.infer<typeof acknowledgeSosSchema>;

export const acknowledgeSosParamsSchema = AcknowledgeSosParams;
export type AcknowledgeSosParamsInput = z.infer<typeof acknowledgeSosParamsSchema>;

export const ingestSosLocationsParamsSchema = IngestSosLocationsParams;
export type IngestSosLocationsParamsInput = z.infer<typeof ingestSosLocationsParamsSchema>;

export const ingestSosLocationsSchema = IngestSosLocationsBody;
export type IngestSosLocationsInput = z.infer<typeof ingestSosLocationsSchema>;

export const getSosStatusParamsSchema = GetSosStatusParams;
export type GetSosStatusParamsInput = z.infer<typeof getSosStatusParamsSchema>;