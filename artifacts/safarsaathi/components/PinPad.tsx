import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Colors from '@/constants/colors';

interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (pin: string) => void;
  maxLength?: number;
  disabled?: boolean;
  submitLabel?: string;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function PinPad({
  value,
  onChange,
  onSubmit,
  maxLength = 4,
  disabled = false,
  submitLabel = 'OK',
}: PinPadProps) {
  const pressDigit = (d: string) => {
    if (disabled || value.length >= maxLength) return;
    Haptics.selectionAsync().catch(() => undefined);
    const next = value + d;
    onChange(next);
    if (next.length === maxLength) {
      onSubmit(next);
    }
  };

  const pressBackspace = () => {
    if (disabled || value.length === 0) return;
    Haptics.selectionAsync().catch(() => undefined);
    onChange(value.slice(0, -1));
  };

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow} accessibilityLabel={`Entered ${value.length} of ${maxLength} digits`}>
        {Array.from({ length: maxLength }).map((_, idx) => (
          <View
            key={idx}
            style={[styles.dot, idx < value.length && styles.dotFilled]}
          />
        ))}
      </View>

      <View style={styles.grid}>
        {DIGITS.map((d) => (
          <TouchableOpacity
            key={d}
            style={styles.key}
            onPress={() => pressDigit(d)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Digit ${d}`}
          >
            <Text style={styles.keyText}>{d}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.key}
          onPress={pressBackspace}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Backspace"
        >
          <Text style={styles.keyAltText}>⌫</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.key}
          onPress={() => pressDigit('0')}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Digit 0"
        >
          <Text style={styles.keyText}>0</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.key, styles.submitKey]}
          onPress={() => onSubmit(value)}
          disabled={disabled || value.length < 4}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
        >
          <Text style={styles.submitText}>{submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: Colors.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    maxWidth: 280,
  },
  key: {
    width: 78,
    height: 58,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitKey: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  keyText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 22,
    color: Colors.textPrimary,
  },
  keyAltText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    color: Colors.textSecondary,
  },
  submitText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});

