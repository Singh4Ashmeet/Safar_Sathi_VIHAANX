import React from 'react';
import Colors from '@/constants/colors';

interface RouteLayerProps {
  nativeLibre: any;
  routeGeoJson: any;
  id?: string;
  color?: string;
  lineWidth?: number;
  isApproximate?: boolean;
}

export default function RouteLayer({
  nativeLibre,
  routeGeoJson,
  id = 'safar-route',
  color = Colors.primary,
  lineWidth = 4.5,
  isApproximate = false,
}: RouteLayerProps) {
  if (!nativeLibre || !routeGeoJson) return null;

  const { ShapeSource, LineLayer } = nativeLibre;

  return (
    <ShapeSource id={`${id}-source`} shape={routeGeoJson}>
      {/* Route Casing for high contrast over street maps */}
      <LineLayer
        id={`${id}-casing`}
        style={{
          lineColor: '#070B16',
          lineWidth: lineWidth + 2.5,
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: 0.8,
        }}
      />

      {/* Main Route Line */}
      <LineLayer
        id={`${id}-line`}
        style={{
          lineColor: isApproximate ? '#F59E0B' : color,
          lineWidth,
          lineCap: 'round',
          lineJoin: 'round',
          lineDasharray: isApproximate ? [3, 2] : undefined,
        }}
      />
    </ShapeSource>
  );
}

