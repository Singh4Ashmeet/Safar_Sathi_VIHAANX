import { z } from 'zod';
import { ListSafetyZonesQueryParams, SubmitSafetyReportBody } from '@workspace/api-zod';

/**
 * Schema for listing safety zones
 */
export const listSafetyZonesSchema = ListSafetyZonesQueryParams.extend({}).strip();

export type ListSafetyZonesInput = z.infer<typeof listSafetyZonesSchema>;

/**
 * Schema for submitting a safety report
 */
export const submitSafetyReportSchema = SubmitSafetyReportBody.extend({}).strip();

export type SubmitSafetyReportInput = z.infer<typeof submitSafetyReportSchema>;