import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { LatLng } from '@workspace/safety-core';
import { Palette } from '@/constants/colors';

export interface MapZoneItem {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  severity: 'low' | 'medium' | 'high';
  category: string;
}

interface SafetyMapViewProps {
  center?: LatLng;
  zoomLevel?: number;
  routePoints?: LatLng[];
  destination?: LatLng | null;
  zones?: MapZoneItem[];
  onZonePress?: (zone: MapZoneItem) => void;
  onMapPress?: (coord: LatLng) => void;
  style?: object;
  nightMode?: boolean;
}

export default function SafetyMapView({
  style,
}: SafetyMapViewProps) {
  return (
    <View style={[styles.container, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 360 200">
        <Defs>
          <LinearGradient id="routeGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#635BFF" stopOpacity="0.9" />
            <Stop offset="100%" stopColor="#A7B4FF" stopOpacity="0.95" />
          </LinearGradient>
        </Defs>

        {/* Dark Grid Background Lines */}
        <Line x1="0" y1="40" x2="360" y2="40" stroke="#1E2640" strokeWidth="1.5" />
        <Line x1="0" y1="90" x2="360" y2="90" stroke="#1E2640" strokeWidth="1.5" />
        <Line x1="0" y1="140" x2="360" y2="140" stroke="#1E2640" strokeWidth="1.5" />

        <Line x1="80" y1="0" x2="80" y2="200" stroke="#1E2640" strokeWidth="1.5" />
        <Line x1="180" y1="0" x2="180" y2="200" stroke="#1E2640" strokeWidth="1.5" />
        <Line x1="280" y1="0" x2="280" y2="200" stroke="#1E2640" strokeWidth="1.5" />

        {/* Angled Street Grid Vectors */}
        <Line x1="20" y1="190" x2="150" y2="10" stroke="#253252" strokeWidth="2.5" />
        <Line x1="110" y1="200" x2="270" y2="10" stroke="#253252" strokeWidth="2" />
        <Line x1="220" y1="190" x2="340" y2="30" stroke="#253252" strokeWidth="2.5" />
        <Line x1="30" y1="50" x2="330" y2="170" stroke="#222C46" strokeWidth="1.5" />

        {/* Connected Luminous Route Path */}
        <Path
          d="M 105 155 L 265 65"
          stroke="url(#routeGradient)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Origin Node (Green) */}
        <Circle cx="105" cy="155" r="14" fill="#00B887" fillOpacity="0.2" />
        <Circle cx="105" cy="155" r="9" fill="none" stroke="#00B887" strokeWidth="3" />
        <Circle cx="105" cy="155" r="4" fill="#FFFFFF" />

        {/* Destination Node (Violet/Lavender) */}
        <Circle cx="265" cy="65" r="14" fill="#635BFF" fillOpacity="0.25" />
        <Circle cx="265" cy="65" r="9" fill="none" stroke="#A7B4FF" strokeWidth="3" />
        <Circle cx="265" cy="65" r="4" fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 180,
    backgroundColor: '#0C101B',
    borderRadius: 14,
    overflow: 'hidden',
  },
});
