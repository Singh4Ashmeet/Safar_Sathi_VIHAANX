import React from 'react';
import type { MapZone } from '@/services/map.service';

interface SafetyZoneLayerProps {
  nativeLibre: any;
  zonesGeoJson: any;
  zones: MapZone[];
  onZonePress?: (zone: MapZone) => void;
}

export default function SafetyZoneLayer({
  nativeLibre,
  zonesGeoJson,
  zones,
  onZonePress,
}: SafetyZoneLayerProps) {
  if (!nativeLibre || !zonesGeoJson) return null;

  const { ShapeSource, CircleLayer } = nativeLibre;

  return (
    <ShapeSource
      id="safety-zones-source"
      shape={zonesGeoJson}
      onPress={(e: any) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        const match = zones.find((z) => z.id === id);
        if (match && onZonePress) onZonePress(match);
      }}
    >
      {/* Outer halo */}
      <CircleLayer
        id="safety-zones-halo"
        style={{
          circleRadius: 36,
          circleColor: ['get', 'color'],
          circleOpacity: 0.15,
        }}
      />

      {/* Main zone indicator circle */}
      <CircleLayer
        id="safety-zones-circle"
        style={{
          circleRadius: 22,
          circleColor: ['get', 'color'],
          circleOpacity: 0.35,
          circleStrokeWidth: 2,
          circleStrokeColor: ['get', 'color'],
        }}
      />
    </ShapeSource>
  );
}

