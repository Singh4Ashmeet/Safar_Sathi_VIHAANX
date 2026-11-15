import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  deleteMe,
  revokeTripShareLinks,
  useListGuardians,
} from '@workspace/api-client-react';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import Colors, { Palette } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useTripContext } from '@/context/TripContext';
import { t, useLanguage } from '@/i18n';
import { clearAllSecureData } from '@/services/secure';

export default function PrivacyScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { activeTrip, shareUrl, setShareUrl } = useTripContext();
  const { data: guardians = [] } = useListGuardians();
  const [busy, setBusy] = useState(false);

  const consented = guardians.filter((g) => g.consentStatus === 'granted');

  const handleStopSharing = async () => {
    setBusy(true);
    try {
      if (activeTrip) {
        await revokeTripShareLinks(activeTrip.id).catch(() => undefined);
      }
      setShareUrl(null);
      Alert.alert('Sharing Stopped', 'All active live-tracking links have been revoked.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account & Data',
      'This permanently deletes your profile, trips, guardians, and local encryption keys.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Permanently Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await deleteMe().catch(() => undefined);
                await clearAllSecureData();
                await logout().catch(() => undefined);
                router.replace('/login');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      <BrandHeader showBack subtitle={t('privacy.title')} />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('privacy.whoCanSee')}</Text>
          {shareUrl ? (
            <View style={styles.activeShareBanner}>
              <Feather name="radio" size={16} color={Palette.successGreen} />
              <Text style={styles.activeLink} numberOfLines={1}>
                Active share: {shareUrl}
              </Text>
            </View>
          ) : (
            <Text style={styles.mutedText}>{t('privacy.noShare')}</Text>
          )}

          <Text style={styles.subLabel}>{t('privacy.consentedGuardians')} ({consented.length})</Text>
          {consented.length === 0 ? (
            <Text style={styles.mutedText}>
              No guardians have been added yet. Add trusted contacts in the Guardians screen to receive live tracking links and SOS alerts.
            </Text>
          ) : (
            consented.map((g) => (
              <View key={g.id} style={styles.guardianRow}>
                <Feather name="user-check" size={16} color={Palette.softLavender} />
                <Text style={styles.guardianItem}>
                  {g.name} ({g.relationship})
                </Text>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.stopShareBtn}
            disabled={busy}
            onPress={() => void handleStopSharing()}
            activeOpacity={0.8}
          >
            <Text style={styles.stopShareText}>{t('privacy.stopSharing')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('privacy.retention')}</Text>
          <Text style={styles.mutedText}>
            • Raw GPS breadcrumbs auto-expire after 7 days.
            {"\n"}• Offline BLE relay mesh carries end-to-end encrypted ciphertext only; intermediate nodes cannot decrypt coordinates.
            {"\n"}• Your emergency contacts are stored with salt-hashed identifiers.
          </Text>

          <TouchableOpacity
            style={styles.deleteBtn}
            disabled={busy}
            onPress={handleDeleteAccount}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteText}>{t('privacy.deleteTripData')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BottomNav activeTab="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Palette.primaryText,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 16,
  },
  card: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Palette.primaryText,
    marginBottom: 10,
  },
  activeShareBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 184, 135, 0.12)',
    borderWidth: 1,
    borderColor: Palette.successGreen,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  activeLink: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.successGreen,
    flex: 1,
  },
  mutedText: {
    fontSize: 13,
    lineHeight: 20,
    color: Palette.secondaryText,
    marginBottom: 14,
  },
  subLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.primaryText,
    marginBottom: 8,
  },
  guardianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  guardianItem: {
    fontSize: 14,
    color: Palette.secondaryText,
  },
  stopShareBtn: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  stopShareText: {
    color: Palette.primaryText,
    fontSize: 14,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: 'rgba(241, 60, 92, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241, 60, 92, 0.35)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  deleteText: {
    color: Palette.sosRed,
    fontSize: 14,
    fontWeight: '700',
  },
});
