import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { MapReport } from '@/services/map.service';
import Colors, { Palette } from '@/constants/colors';

interface ReportMarkerLayerProps {
  nativeLibre: any;
  reports: MapReport[];
  onReportPress?: (report: MapReport) => void;
}

export default function ReportMarkerLayer({
  nativeLibre,
  reports,
  onReportPress,
}: ReportMarkerLayerProps) {
  if (!nativeLibre || reports.length === 0) return null;

  const { PointAnnotation } = nativeLibre;

  return (
    <>
      {reports.map((report) => {
        const isHazard = report.category === 'harassment' || report.category === 'theft_snatch';
        const isLighting = report.category === 'poor_lighting';
        const bg = isHazard ? Colors.danger : isLighting ? Colors.warning : Colors.safe;

        return (
          <PointAnnotation
            key={report.id}
            id={`report-${report.id}`}
            coordinate={[report.lng, report.lat]}
            onSelected={() => onReportPress?.(report)}
          >
            <View style={[styles.markerPin, { backgroundColor: bg }]}>
              <Feather
                name={isHazard ? 'alert-triangle' : isLighting ? 'moon' : 'shield'}
                size={12}
                color="#FFFFFF"
              />
            </View>
          </PointAnnotation>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  markerPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
});

