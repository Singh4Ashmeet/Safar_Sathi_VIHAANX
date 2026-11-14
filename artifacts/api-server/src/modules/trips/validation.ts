import { z } from 'zod';
import { CreateTripBody, IngestTripLocationsParams, IngestTripLocationsBody, CreateTripShareLinkBody, RevokeTripShareLinksParams, EndTripParams, EndTripResponse } from '@workspace/api-zod';

/**
 * Schema for trip creation - extends the generated Zod schema with additional validations
 */
export const createTripSchema = CreateTripBody.extend({
  tripId: z.string().uuid('tripId must be a valid UUID'),
  destination: z.string().min(1, 'Destination is required').max(500, 'Destination must be 500 characters or fewer'),
  destLat: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  destLng: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  routePolyline: z.string().min(1, 'Route polyline is required'),
  startedAt: z.number().int().positive('startedAt must be a positive integer timestamp'),
  etaAt: z.number().int().positive('etaAt must be a positive integer timestamp').optional(),
}).strip();

export type CreateTripInput = z.infer<typeof createTripSchema>;

/**
 * Schema for location batch ingestion
 */
export const ingestLocationsSchema = IngestTripLocationsBody.extend({}).strip();

export type IngestLocationsInput = z.infer<typeof ingestLocationsSchema>;

/**
 * Schema for trip ID path parameter
 */
export const tripIdParamsSchema = IngestTripLocationsParams;
export type TripIdParamsInput = z.infer<typeof tripIdParamsSchema>;

/**
 * Schema for share link creation
 */
export const createShareLinkSchema = z.object({
  guardianId: z.string().uuid('guardianId must be a valid UUID'),
  expiresInSec: z.number().int().min(300, 'Minimum expiry is 300 seconds (5 minutes)').max(86400, 'Maximum expiry is 86400 seconds (24 hours)').default(86400),
}).strip();

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;

/**
 * Schema for share link revocation path parameter
 */
export const revokeShareLinkParamsSchema = z.object({
  id: z.string().uuid(),
});

export type RevokeShareLinkParamsInput = z.infer<typeof revokeShareLinkParamsSchema>;

/**
 * Schema for trip end path parameter
 */
export const endTripParamsSchema = EndTripParams;
export type EndTripParamsInput = z.infer<typeof endTripParamsSchema>;

/**
 * Schema for trip end response
 */
export const endTripResponseSchema = EndTripResponse;
export type EndTripResponseOutput = z.infer<typeof endTripResponseSchema>;