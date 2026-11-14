import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';
import Colors from '@/constants/colors';

interface BigButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'safe' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export default function BigButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
}: BigButtonProps) {
  const bg =
    variant === 'danger'
      ? Colors.danger
      : variant === 'safe'
        ? Colors.safe
        : variant === 'secondary'
          ? Colors.surface
          : Colors.primary;
  const fg = variant === 'secondary' ? Colors.primary : '#FFFFFF';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.btn,
        { backgroundColor: bg },
        variant === 'secondary' && styles.secondaryBorder,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.text, { color: fg }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBorder: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  disabled: {
    opacity: 0.55,
  },
  text: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
});

