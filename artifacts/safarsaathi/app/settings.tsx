import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import Colors, { Palette } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useTripContext } from '@/context/TripContext';
import { useLanguage } from '@/i18n';
import { t } from '@/i18n';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [lang, setLang] = useLanguage();
  const { logout, user } = useAuth();
  const { discreetMode, setDiscreetMode } = useTripContext();

  const [langModalOpen, setLangModalOpen] = useState(false);
  const [permModalOpen, setPermModalOpen] = useState(false);

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      {/* Brand Header */}
      <BrandHeader rightBadgeText={discreetMode ? 'Discreet' : 'Settings'} isReady={!discreetMode} />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.titleWrap}>
          <Text style={styles.screenTitle}>{t('settings.title')}</Text>
          <Text style={styles.screenSubtitle}>{t('settings.subtitle')}</Text>
        </View>

        {/* Settings Card */}
        <View style={styles.settingsCard}>
          {/* Discreet Mode */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
              setDiscreetMode(!discreetMode);
            }}
            activeOpacity={0.8}
          >
            <View style={styles.settingTextCol}>
              <Text style={styles.settingLabel}>{t('settings.discreetMode')}</Text>
              <Text style={styles.settingSub}>
                {discreetMode ? 'Stealth appearance active' : t('settings.discreetSubtitle')}
              </Text>
            </View>
            <Switch
              value={discreetMode}
              onValueChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                setDiscreetMode(val);
              }}
              trackColor={{ false: '#2D3450', true: Palette.primaryViolet }}
              thumbColor="#FFFFFF"
            />
          </TouchableOpacity>

          {/* Language Selector */}
          <View style={styles.settingCol}>
            <Text style={styles.settingSubLabel}>{t('settings.language')}</Text>
            <TouchableOpacity
              style={styles.dropdownBox}
              onPress={() => setLangModalOpen(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.dropdownText}>
                {lang === 'hi' ? 'हिन्दी (Hindi)' : 'English'}
              </Text>
              <Feather name="chevron-down" size={18} color={Palette.secondaryText} />
            </TouchableOpacity>
          </View>

          {/* Permissions */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('settings.permissions')}</Text>
            <TouchableOpacity
              style={styles.actionPillBtn}
              onPress={() => setPermModalOpen(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.actionPillText}>{t('settings.review')}</Text>
            </TouchableOpacity>
          </View>

          {/* Privacy Centre */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('settings.privacyCentre')}</Text>
            <TouchableOpacity
              style={styles.actionPillBtn}
              onPress={() => router.push('/privacy')}
              activeOpacity={0.8}
            >
              <Text style={styles.actionPillText}>{t('settings.open')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* About Card */}
        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>{t('settings.about')}</Text>
          <Text style={styles.aboutDesc}>{t('settings.aboutDescription')}</Text>
        </View>

        {/* Account / User Section */}
        <View style={styles.accountCard}>
          <Text style={styles.accountLabel}>{t('settings.signedInAs')}</Text>
          <Text style={styles.accountEmail}>{user?.email || 'student@safarsaathi.in'}</Text>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => void logout().catch(() => router.replace('/login'))}
            activeOpacity={0.8}
          >
            <Text style={styles.logoutText}>{t('settings.logOut')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Language Picker Modal */}
      <Modal visible={langModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('settings.selectLanguage')}</Text>
            <TouchableOpacity
              style={[styles.langOption, lang === 'en' && styles.langOptionActive]}
              onPress={() => {
                setLang('en');
                setLangModalOpen(false);
              }}
            >
              <Text style={[styles.langOptionText, lang === 'en' && styles.langOptionTextActive]}>
                English
              </Text>
              {lang === 'en' && <Feather name="check" size={18} color={Palette.primaryViolet} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.langOption, lang === 'hi' && styles.langOptionActive]}
              onPress={() => {
                setLang('hi');
                setLangModalOpen(false);
              }}
            >
              <Text style={[styles.langOptionText, lang === 'hi' && styles.langOptionTextActive]}>
                हिन्दी (Hindi)
              </Text>
              {lang === 'hi' && <Feather name="check" size={18} color={Palette.primaryViolet} />}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Permissions Modal */}
      <Modal visible={permModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.permHeader}>
              <Text style={styles.modalTitle}>{t('settings.devicePermissions')}</Text>
              <TouchableOpacity onPress={() => setPermModalOpen(false)}>
                <Feather name="x" size={20} color={Palette.secondaryText} />
              </TouchableOpacity>
            </View>

            <View style={styles.permItem}>
              <Feather name="map-pin" size={20} color={Palette.successGreen} />
              <View style={{ flex: 1 }}>
                <Text style={styles.permName}>Location Access</Text>
                <Text style={styles.permStatus}>Granted (Always in background)</Text>
              </View>
            </View>

            <View style={styles.permItem}>
              <Feather name="bell" size={20} color={Palette.successGreen} />
              <View style={{ flex: 1 }}>
                <Text style={styles.permName}>Notifications</Text>
                <Text style={styles.permStatus}>Granted (Discreet mode aware)</Text>
              </View>
            </View>

            <View style={styles.permItem}>
              <Feather name="bluetooth" size={20} color={Palette.softLavender} />
              <View style={{ flex: 1 }}>
                <Text style={styles.permName}>Nearby Devices / BLE</Text>
                <Text style={styles.permStatus}>Ready for offline mesh fallback</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closePermBtn}
              onPress={() => setPermModalOpen(false)}
            >
              <Text style={styles.closePermText}>{t('settings.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation */}
      <BottomNav activeTab="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  titleWrap: {
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Palette.primaryText,
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: Palette.secondaryText,
    marginTop: 4,
  },
  settingsCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
    gap: 18,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingTextCol: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  settingSub: {
    fontSize: 12,
    color: Palette.secondaryText,
    marginTop: 2,
    fontWeight: '500',
  },
  settingCol: {
    gap: 8,
  },
  settingSubLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Palette.secondaryText,
  },
  dropdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownText: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.primaryText,
  },
  actionPillBtn: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 16,
  },
  actionPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  aboutCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
  },
  aboutTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  aboutDesc: {
    fontSize: 13,
    color: Palette.secondaryText,
    marginTop: 4,
    lineHeight: 18,
  },
  accountCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
    gap: 6,
  },
  accountLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.mutedText,
  },
  accountEmail: {
    fontSize: 15,
    fontWeight: '700',
    color: Palette.primaryText,
    marginBottom: 8,
  },
  logoutBtn: {
    backgroundColor: 'rgba(241, 60, 92, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241, 60, 92, 0.35)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutText: {
    color: Palette.sosRed,
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 8, 15, 0.85)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.primaryText,
    marginBottom: 6,
  },
  langOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 12,
    padding: 14,
  },
  langOptionActive: {
    borderColor: Palette.primaryViolet,
    backgroundColor: 'rgba(99, 91, 255, 0.15)',
  },
  langOptionText: {
    fontSize: 15,
    color: Palette.secondaryText,
    fontWeight: '600',
  },
  langOptionTextActive: {
    color: Palette.primaryText,
    fontWeight: '700',
  },
  permHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  permItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Palette.borders,
  },
  permName: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.primaryText,
  },
  permStatus: {
    fontSize: 12,
    color: Palette.secondaryText,
    marginTop: 2,
  },
  closePermBtn: {
    backgroundColor: Palette.primaryViolet,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  closePermText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
