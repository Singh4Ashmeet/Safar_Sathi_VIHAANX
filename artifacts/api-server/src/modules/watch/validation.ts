import { z } from 'zod';
import { StartWatchMeBody, ConfirmWatchMeParams } from '@workspace/api-zod';

/**
 * Schema for starting a Watch Me timer
 */
export const startWatchSchema = StartWatchMeBody.extend({}).strip();

export type StartWatchInput = z.infer<typeof startWatchSchema>;

/**
 * Schema for confirming a Watch Me timer
 */
export const confirmWatchParamsSchema = ConfirmWatchMeParams;

export type ConfirmWatchParamsInput = z.infer<typeof confirmWatchParamsSchema>;