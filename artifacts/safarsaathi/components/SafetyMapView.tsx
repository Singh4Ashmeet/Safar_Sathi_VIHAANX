import React from 'react';
import type { LatLng } from '@workspace/safety-core';
import SafarMap, { type SafarMapProps } from './map/SafarMap';
import type { MapZone } from '@/services/map.service';

export type MapZoneItem = MapZone;

export interface SafetyMapViewProps extends SafarMapProps {}

export default function SafetyMapView(props: SafetyMapViewProps) {
  return <SafarMap {...props} />;
}
