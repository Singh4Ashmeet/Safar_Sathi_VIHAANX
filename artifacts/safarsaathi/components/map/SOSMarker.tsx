import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { LatLng } from '@workspace/safety-core';
import Colors from '@/constants/colors';

interface SOSMarkerProps {
  nativeLibre: any;
  coordinate: LatLng;
  source?: string;
  timestamp?: number;
}

export default function SOSMarker({
  nativeLibre,
  coordinate,
  source = 'direct_gps',
  timestamp,
}: SOSMarkerProps) {
  if (!nativeLibre) return null;

  const { PointAnnotation } = nativeLibre;
  const isBle = source === 'ble_gateway' || source === 'ble_relay';

  return (
    <PointAnnotation
      id="sos-distress-marker"
      coordinate={[coordinate.lng, coordinate.lat]}
    >
      <View style={styles.container}>
        {/* Pulsing red beacon halo */}
        <View style={styles.beaconHalo} />

        {/* Central distress pin */}
        <View style={styles.corePin}>
          <Feather name="alert-octagon" size={16} color="#FFFFFF" />
        </View>

        {/* Floating source tag */}
        <View style={[styles.sourceBadge, isBle && styles.bleBadge]}>
          <Text style={styles.sourceText}>
            {isBle ? 'BLE MESH RELAY' : 'EMERGENCY SOS'}
          </Text>
        </View>
      </View>
    </PointAnnotation>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  beaconHalo: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.6)',
  },
  corePin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: Colors.danger,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 6,
  },
  sourceBadge: {
    marginTop: 4,
    backgroundColor: 'rgba(12, 16, 27, 0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  bleBadge: {
    borderColor: '#38BDF8',
  },
  sourceText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

