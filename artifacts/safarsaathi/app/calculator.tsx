import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette } from '@/constants/colors';

const KEYS = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['C', '0', '=', '+'],
];

/**
 * Neutral Discreet Quick-Exit Calculator Screen.
 * Long-press "=" to safely return to SafarSaathi.
 */
export default function CalculatorQuickExitScreen() {
  const insets = useSafeAreaInsets();
  const [expr, setExpr] = useState('0');

  const onPressKey = (k: string) => {
    if (k === 'C') {
      setExpr('0');
      return;
    }
    if (k === '=') {
      try {
        const sanitized = expr.replace(/[^0-9+\-*/.]/g, '');
        const fn = new Function(`return (${sanitized})`) as () => number;
        const val = fn();
        setExpr(Number.isFinite(val) ? String(val) : '0');
      } catch {
        setExpr('0');
      }
      return;
    }
    setExpr((prev) => (prev === '0' ? k : prev + k));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.display}>
        <Text style={styles.displayText} numberOfLines={1}>
          {expr}
        </Text>
      </View>

      <View style={styles.pad}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.btn, k === '=' && styles.eqBtn]}
                onPress={() => onPressKey(k)}
                onLongPress={() => {
                  if (k === '=') router.replace('/');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.btnText}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
  },
  display: {
    padding: 20,
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  displayText: {
    fontSize: 48,
    color: Palette.primaryText,
    fontFamily: 'Inter_600SemiBold',
  },
  pad: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1,
    height: 72,
    borderRadius: 18,
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eqBtn: {
    backgroundColor: Palette.primaryViolet,
    borderColor: Palette.primaryViolet,
  },
  btnText: {
    fontSize: 24,
    color: Palette.primaryText,
    fontFamily: 'Inter_600SemiBold',
  },
});
