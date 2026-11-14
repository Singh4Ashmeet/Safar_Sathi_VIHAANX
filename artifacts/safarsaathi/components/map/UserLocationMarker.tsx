import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { LatLng } from '@workspace/safety-core';
import Colors, { Palette } from '@/constants/colors';

interface UserLocationMarkerProps {
  coordinate: LatLng;
  accuracy?: number;
  isStale?: boolean;
}

export default function UserLocationMarker({
  coordinate,
  accuracy,
  isStale = false,
}: UserLocationMarkerProps) {
  return (
    <View style={styles.container}>
      {/* Accuracy halo */}
      {accuracy && accuracy > 0 && !isStale && (
        <View
          style={[
            styles.accuracyHalo,
            {
              width: Math.min(80, Math.max(28, accuracy * 1.5)),
              height: Math.min(80, Math.max(28, accuracy * 1.5)),
              borderRadius: Math.min(40, Math.max(14, accuracy * 0.75)),
            },
          ]}
        />
      )}

      {/* Outer pulsing ring */}
      <View
        style={[
          styles.outerRing,
          isStale && styles.outerRingStale,
        ]}
      >
        {/* Core dot */}
        <View style={[styles.innerDot, isStale && styles.innerDotStale]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  accuracyHalo: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 184, 135, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 184, 135, 0.35)',
  },
  outerRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00B887',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  outerRingStale: {
    backgroundColor: '#94A3B8',
    shadowColor: '#64748B',
  },
  innerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#00B887',
  },
  innerDotStale: {
    backgroundColor: '#64748B',
  },
});

