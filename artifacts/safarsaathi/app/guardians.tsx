import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  type AddGuardianRequestChannelsItem,
  type Guardian,
} from '@workspace/api-client-react';
import { normalizePhoneE164 } from '@workspace/safety-core';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import Colors, { Palette } from '@/constants/colors';
import { useGuardians } from '@/context/GuardianContext';
import { t, useLanguage } from '@/i18n';

export default function GuardiansScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { guardians, isLoading, addGuardian, removeGuardian } = useGuardians();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [prefModalOpen, setPrefModalOpen] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('Guardian');
  const [formError, setFormError] = useState<string | null>(null);

  // Preference switches
  const [shareLiveTrip, setShareLiveTrip] = useState(true);
  const [shareBattery, setShareBattery] = useState(true);
  const [smsFallback, setSmsFallback] = useState(true);

  const handleAdd = async () => {
    setFormError(null);
    if (!name.trim() || !phone.trim()) {
      setFormError('Please enter a name and phone number.');
      return;
    }

    let phoneE164: string;
    try {
      phoneE164 = normalizePhoneE164(phone);
    } catch {
      phoneE164 = phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '')}`;
    }

    try {
      await addGuardian({
        name: name.trim(),
        phoneE164,
        relationship: relationship.trim() || 'Guardian',
        channels: ['sms'],
      });
      setName('');
      setPhone('');
      setAddModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add guardian');
    }
  };

  const handleRemove = (g: Guardian) => {
    Alert.alert('Remove Guardian', `Remove ${g.name} from your trusted circle?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void removeGuardian(g.id);
        },
      },
    ]);
  };

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      {/* Brand Header */}
      <BrandHeader rightBadgeText="Demo mode" />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.titleWrap}>
          <Text style={styles.screenTitle}>{t('guardians.screenTitle')}</Text>
          <Text style={styles.screenSubtitle}>{t('guardians.screenSubtitle')}</Text>
        </View>

        {/* YOUR GUARDIANS Card */}
        <View style={styles.guardiansCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEyebrow}>{t('guardians.cardEyebrow')}</Text>
            <TouchableOpacity
              style={styles.addGuardianBtn}
              onPress={() => setAddModalOpen(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addGuardianText}>{t('guardians.addCtaShort')}</Text>
            </TouchableOpacity>
          </View>

          {/* List of Guardians */}
          <View style={styles.guardiansList}>
            {guardians.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconWrap}>
                  <Feather name="shield" size={30} color={Palette.primaryViolet} />
                </View>
                <Text style={styles.emptyTitle}>Your Circle is Empty</Text>
                <Text style={styles.emptyDesc}>
                  Add 2 to 5 trusted family members or friends. They will receive live GPS tracking links and emergency SMS alerts during your trips or SOS.
                </Text>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={() => setAddModalOpen(true)}
                  activeOpacity={0.85}
                >
                  <Feather name="plus-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.emptyAddBtnText}>Add First Guardian</Text>
                </TouchableOpacity>
              </View>
            ) : (
              guardians.map((g, idx) => {
                const initial = g.name.charAt(0).toUpperCase();
                const isLast = idx === guardians.length - 1;

                return (
                  <View key={g.id}>
                    <View style={styles.guardianRow}>
                      <View style={styles.avatarBubble}>
                        <Text style={styles.avatarText}>{initial}</Text>
                      </View>

                      <View style={styles.guardianInfoCol}>
                        <Text style={styles.guardianName}>{g.name}</Text>
                        <Text style={styles.guardianRole}>
                          {g.relationship || 'Guardian'} · {g.phoneE164}
                        </Text>
                      </View>

                      <View style={styles.guardianRowActions}>
                        <View style={styles.activePill}>
                          <View style={styles.activeDot} />
                          <Text style={styles.activeText}>SMS Alert</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.deleteIconButton}
                          onPress={() => handleRemove(g)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Feather name="trash-2" size={18} color={Palette.sosRed} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {!isLast && <View style={styles.divider} />}
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* How guardian sharing works Card */}
        <View style={styles.sharingCard}>
          <Text style={styles.sharingTitle}>{t('guardians.sharingTitle')}</Text>
          <Text style={styles.sharingDesc}>{t('guardians.sharingDescription')}</Text>

          <TouchableOpacity
            style={styles.alertPrefBtn}
            onPress={() => setPrefModalOpen(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.alertPrefText}>{t('guardians.alertPreferences')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add Guardian Modal */}
      <Modal visible={addModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('guardians.addTitle')}</Text>
              <TouchableOpacity onPress={() => setAddModalOpen(false)}>
                <Feather name="x" size={22} color={Palette.secondaryText} />
              </TouchableOpacity>
            </View>

            {formError && <Text style={styles.errorText}>{formError}</Text>}

            <Text style={styles.inputLabel}>{t('guardians.name')}</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder={t('guardians.namePlaceholder')}
                placeholderTextColor={Palette.mutedText}
              />
            </View>

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>{t('guardians.phone')}</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 98765 43210"
                placeholderTextColor={Palette.mutedText}
                keyboardType="phone-pad"
              />
            </View>

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>{t('guardians.relationship')}</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                value={relationship}
                onChangeText={setRelationship}
                placeholder={t('guardians.relationshipPlaceholder')}
                placeholderTextColor={Palette.mutedText}
              />
            </View>

            <TouchableOpacity
              style={styles.confirmAddBtn}
              onPress={() => void handleAdd()}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmAddText}>{t('guardians.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Alert Preferences Modal */}
      <Modal visible={prefModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('guardians.preferencesTitle')}</Text>
              <TouchableOpacity onPress={() => setPrefModalOpen(false)}>
                <Feather name="x" size={22} color={Palette.secondaryText} />
              </TouchableOpacity>
            </View>

            <View style={styles.prefRow}>
              <View style={styles.prefTextCol}>
                <Text style={styles.prefLabel}>{t('guardians.liveLocation')}</Text>
                <Text style={styles.prefSub}>{t('guardians.liveLocationSub')}</Text>
              </View>
              <Switch
                value={shareLiveTrip}
                onValueChange={setShareLiveTrip}
                trackColor={{ false: '#2D3450', true: Palette.primaryViolet }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.prefRow}>
              <View style={styles.prefTextCol}>
                <Text style={styles.prefLabel}>{t('guardians.battery')}</Text>
                <Text style={styles.prefSub}>{t('guardians.batterySub')}</Text>
              </View>
              <Switch
                value={shareBattery}
                onValueChange={setShareBattery}
                trackColor={{ false: '#2D3450', true: Palette.primaryViolet }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.prefRow}>
              <View style={styles.prefTextCol}>
                <Text style={styles.prefLabel}>{t('guardians.smsFallback')}</Text>
                <Text style={styles.prefSub}>{t('guardians.smsFallbackSub')}</Text>
              </View>
              <Switch
                value={smsFallback}
                onValueChange={setSmsFallback}
                trackColor={{ false: '#2D3450', true: Palette.primaryViolet }}
                thumbColor="#FFFFFF"
              />
            </View>

            <TouchableOpacity
              style={styles.confirmAddBtn}
              onPress={() => setPrefModalOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmAddText}>{t('guardians.savePreferences')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation */}
      <BottomNav activeTab="circle" />
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
  guardiansCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: Palette.primaryText,
    letterSpacing: 0.8,
  },
  addGuardianBtn: {
    backgroundColor: 'rgba(99, 91, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(99, 91, 255, 0.4)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  addGuardianText: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.softLavender,
  },
  guardiansList: {
    gap: 12,
  },
  guardianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  avatarBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#272E49',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: Palette.softLavender,
  },
  guardianInfoCol: {
    flex: 1,
  },
  guardianName: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  guardianRole: {
    fontSize: 12,
    color: Palette.secondaryText,
    marginTop: 2,
    fontWeight: '500',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.successGreen,
  },
  activeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.successGreen,
  },
  divider: {
    height: 1,
    backgroundColor: Palette.borders,
    marginVertical: 6,
  },
  sharingCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
  },
  sharingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  sharingDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: Palette.secondaryText,
    marginTop: 6,
    marginBottom: 16,
  },
  alertPrefBtn: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertPrefText: {
    fontSize: 15,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 8, 15, 0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Palette.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Palette.borders,
    padding: 22,
    gap: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  errorText: {
    color: Palette.sosRed,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.secondaryText,
  },
  inputWrap: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  textInput: {
    color: Palette.primaryText,
    fontSize: 14,
  },
  confirmAddBtn: {
    backgroundColor: Palette.primaryViolet,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 14,
  },
  confirmAddText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Palette.borders,
  },
  prefTextCol: {
    flex: 1,
  },
  prefLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.primaryText,
  },
  prefSub: {
    fontSize: 12,
    color: Palette.secondaryText,
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
  },
  emptyIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(124, 92, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  emptyDesc: {
    fontSize: 13,
    color: Palette.secondaryText,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Palette.primaryViolet,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  guardianRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteIconButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
});
