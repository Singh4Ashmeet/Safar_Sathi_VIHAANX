import { z } from 'zod';
import { RegisterRideBody } from '@workspace/api-zod';

/**
 * Schema for registering a ride
 */
export const registerRideSchema = RegisterRideBody.extend({}).strip();

export type RegisterRideInput = z.infer<typeof registerRideSchema>;