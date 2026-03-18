/**
 * FormationSetupModal — 포메이션 생성 모달
 * 스테이지 프리셋 선택 + 댄서 수 설정 → FormationData 생성
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '../../stores/settingsStore';
import { FormationData, STAGE_PRESETS, createDefaultDancers } from '../../types/formation';
import { Colors, Spacing } from '../../constants/theme';

interface FormationSetupModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (formation: FormationData) => void;
}

export function FormationSetupModal({ visible, onClose, onCreated }: FormationSetupModalProps) {
  const { t } = useTranslation();
  const setStageConfig = useSettingsStore((s) => s.setStageConfig);

  const [presetIdx, setPresetIdx] = useState(1); // default 8×4m
  const [dancerCount, setDancerCount] = useState(4);

  const handleCreate = () => {
    const preset = STAGE_PRESETS[presetIdx];
    setStageConfig(preset.config);

    const dancers = createDefaultDancers(dancerCount);
    const formation: FormationData = {
      version: 1,
      dancers,
      keyframes: [{
        beatIndex: 0,
        positions: dancers.map((d, i) => ({
          dancerId: d.id,
          x: 0.3 + (i % 2) * 0.4,
          y: 0.3 + Math.floor(i / 2) * 0.2,
        })),
      }],
    };

    onCreated(formation);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.container} onPress={() => {}}>
          <Text style={styles.title}>{t('player.formation')}</Text>

          {/* Stage presets */}
          <Text style={styles.label}>{t('player.stageSize')}</Text>
          <View style={styles.presetRow}>
            {STAGE_PRESETS.map((preset, idx) => (
              <TouchableOpacity
                key={preset.label}
                style={[styles.presetBtn, presetIdx === idx && styles.presetBtnActive]}
                onPress={() => setPresetIdx(idx)}
              >
                <Text style={[styles.presetBtnText, presetIdx === idx && styles.presetBtnTextActive]}>
                  {preset.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Dancer count */}
          <View style={styles.dancerRow}>
            <Text style={styles.label}>{t('player.dancers')}</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setDancerCount(Math.max(2, dancerCount - 1))}
              >
                <Ionicons name="remove" size={18} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{dancerCount}</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setDancerCount(Math.min(12, dancerCount + 1))}
              >
                <Ionicons name="add" size={18} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Create button */}
          <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
            <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
            <Text style={styles.createBtnText}>{t('player.startFormation')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: {
    width: '85%', backgroundColor: Colors.surface,
    borderRadius: 16, padding: 20,
  },
  title: {
    fontSize: 16, fontWeight: '700', color: Colors.text,
    marginBottom: 16, textAlign: 'center',
  },
  label: {
    fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16,
  },
  presetBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  presetBtnActive: {
    backgroundColor: 'rgba(187,134,252,0.2)',
    borderColor: Colors.primary,
  },
  presetBtnText: { fontSize: 13, color: Colors.textSecondary },
  presetBtnTextActive: { color: Colors.primary, fontWeight: '700' },
  dancerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepperValue: { fontSize: 18, fontWeight: '700', color: Colors.text, minWidth: 24, textAlign: 'center' },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(187,134,252,0.15)', borderRadius: 10,
    paddingVertical: 12, marginTop: 4,
  },
  createBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
});
