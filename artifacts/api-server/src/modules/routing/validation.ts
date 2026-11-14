import { z } from 'zod';
import { ComputeRouteBody, SearchPlacesQueryParams, ComputeRouteResponse } from '@workspace/api-zod';

/**
 * Schema for route request
 */
export const routeRequestSchema = ComputeRouteBody.extend({}).strip();

export type RouteRequestInput = z.infer<typeof routeRequestSchema>;

/**
 * Schema for place search query params
 */
export const placeSearchSchema = SearchPlacesQueryParams.extend({}).strip();

export type PlaceSearchInput = z.infer<typeof placeSearchSchema>;

/**
 * Schema for route response
 */
export const routeResponseSchema = ComputeRouteResponse.extend({}).strip();

export type RouteResponseOutput = z.infer<typeof routeResponseSchema>;