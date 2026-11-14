import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Colors from '@/constants/colors';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  dark?: boolean;
}

export default function Card({ children, style, dark = false }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        dark && styles.cardDark,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardDark: {
    backgroundColor: Colors.dark.surface,
    borderColor: Colors.dark.border,
  },
});

