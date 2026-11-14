import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BigButton from '@/components/BigButton';
import Card from '@/components/Card';
import DeliveryRow from '@/components/DeliveryRow';
import OfflineBanner from '@/components/OfflineBanner';
import PinPad from '@/components/PinPad';
import SOSButton from '@/components/SOSButton';
import StatusChip from '@/components/StatusChip';
import Colors from '@/constants/colors';

export default function UiKitScreen() {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>SafarSaathi UI Kit</Text>

      <OfflineBanner />

      <Card style={styles.section}>
        <Text style={styles.heading}>StatusChips</Text>
        <View style={styles.chips}>
          <StatusChip status="safe" />
          <StatusChip status="warning" score={45} />
          <StatusChip status="danger" score={85} />
          <StatusChip status="signal_lost" />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.heading}>BigButtons</Text>
        <BigButton label="Primary Action" onPress={() => undefined} style={styles.gap} />
        <BigButton label="Safe Action" variant="safe" onPress={() => undefined} style={styles.gap} />
        <BigButton label="Danger Action" variant="danger" onPress={() => undefined} style={styles.gap} />
        <BigButton label="Secondary Action" variant="secondary" onPress={() => undefined} />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.heading}>SOSButton (1.5s Hold)</Text>
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <SOSButton onTrigger={() => undefined} size={120} />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.heading}>DeliveryRow</Text>
        <DeliveryRow guardianName="Maa" channel="sms" status="sent" />
        <DeliveryRow
          guardianName="Papa"
          channel="telegram"
          status="failed"
          onCallGuardian={() => undefined}
          onCall112={() => undefined}
        />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.heading}>PinPad</Text>
        <PinPad value={pin} onChange={setPin} onSubmit={() => setPin('')} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 40 },
  backBtn: { minHeight: 44, justifyContent: 'center' },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.primary, marginBottom: 14 },
  section: { marginBottom: 14 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.textPrimary, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gap: { marginBottom: 10 },
});
