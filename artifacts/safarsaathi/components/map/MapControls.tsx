import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Palette } from '@/constants/colors';

interface MapControlsProps {
  onRecenter?: () => void;
  nightMode?: boolean;
  onToggleNightMode?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export default function MapControls({
  onRecenter,
  nightMode,
  onToggleNightMode,
  onZoomIn,
  onZoomOut,
}: MapControlsProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Top right floating buttons */}
      <View style={styles.buttonStack}>
        {onToggleNightMode && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={onToggleNightMode}
            activeOpacity={0.8}
          >
            <Feather
              name={nightMode ? 'sun' : 'moon'}
              size={18}
              color={nightMode ? '#FBBF24' : '#E0E7FF'}
            />
          </TouchableOpacity>
        )}

        {onRecenter && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={onRecenter}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="crosshairs-gps"
              size={20}
              color={Palette.primaryViolet}
            />
          </TouchableOpacity>
        )}

        {onZoomIn && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={onZoomIn}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={18} color="#E0E7FF" />
          </TouchableOpacity>
        )}

        {onZoomOut && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={onZoomOut}
            activeOpacity={0.8}
          >
            <Feather name="minus" size={18} color="#E0E7FF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 100,
  },
  buttonStack: {
    gap: 8,
  },
  controlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(12, 16, 27, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1E2640',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});

