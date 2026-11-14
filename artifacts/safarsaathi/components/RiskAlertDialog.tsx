import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Colors from '@/constants/colors';
import { t, useLanguage } from '@/i18n';

interface RiskAlertDialogProps {
  visible: boolean;
  message: string;
  onSafe: () => void;
  onAlert: () => void;
  timeoutSeconds?: number;
}

export default function RiskAlertDialog({
  visible,
  message,
  onSafe,
  onAlert,
  timeoutSeconds = 20,
}: RiskAlertDialogProps) {
  useLanguage();
  const [countdown, setCountdown] = useState(timeoutSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setCountdown(timeoutSeconds);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          onAlert();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, timeoutSeconds, onAlert]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('sos.promptTitle')}</Text>
          <Text style={styles.message}>{message}</Text>
          <Text style={styles.timer}>{countdown}s</Text>

          <TouchableOpacity style={styles.safeBtn} onPress={onSafe}>
            <Text style={styles.btnText}>{t('watch.confirmSafe')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sosBtn} onPress={onAlert}>
            <Text style={styles.btnText}>SOS</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.textPrimary,
  },
  message: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  timer: {
    fontFamily: 'Inter_700Bold',
    fontSize: 40,
    color: Colors.danger,
    marginVertical: 16,
  },
  safeBtn: {
    width: '100%',
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: Colors.safe,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  sosBtn: {
    width: '100%',
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
