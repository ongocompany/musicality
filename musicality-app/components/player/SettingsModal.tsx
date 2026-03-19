import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing } from '../../constants/theme';
import { StageConfig, STAGE_PRESETS } from '../../types/formation';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  beatTimeOffset: number;
  bpm: number;
  onAdjustOffset: (delta: number) => void;
  onResetOffset: () => void;
  onExport: () => void;
  onImport: () => void;
  onReanalyze: () => void;
  onEditBpm: () => void;
  onResetAll: () => void;
  // Optional: stage config (shown only in formation mode)
  stageConfig?: StageConfig;
  onStageConfigChange?: (config: StageConfig) => void;
}

export function SettingsModal({
  visible, onClose,
  beatTimeOffset, bpm,
  onAdjustOffset, onResetOffset,
  onExport, onImport,
  onReanalyze, onEditBpm, onResetAll,
  stageConfig, onStageConfigChange,
}: SettingsModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{t('player.trackSettings', '트랙 설정')}</Text>

          {/* Beat offset */}
          <View style={styles.item}>
            <Ionicons name="locate-outline" size={20} color={Colors.accent} />
            <View style={styles.itemText}>
              <Text style={styles.itemLabel}>{t('player.beatOffset', '비트 미세조정')}</Text>
            </View>
            <View style={styles.offsetControls}>
              <TouchableOpacity style={styles.offsetBtn} onPress={() => onAdjustOffset(-100)}>
                <Text style={styles.offsetBtnText}>-100</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.offsetCenter} onPress={onResetOffset}>
                <Text style={[styles.offsetValue, beatTimeOffset !== 0 && { color: Colors.primary }]}>
                  {beatTimeOffset > 0 ? `+${beatTimeOffset}ms` : `${beatTimeOffset}ms`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.offsetBtn} onPress={() => onAdjustOffset(100)}>
                <Text style={styles.offsetBtnText}>+100</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Export */}
          <TouchableOpacity style={styles.item} onPress={onExport}>
            <Ionicons name="share-outline" size={20} color={Colors.textSecondary} />
            <View style={styles.itemText}>
              <Text style={styles.itemLabel}>{t('player.export', '내보내기')}</Text>
              <Text style={styles.itemDesc}>PhraseNote / ChoreoNote</Text>
            </View>
          </TouchableOpacity>

          {/* Import */}
          <TouchableOpacity style={styles.item} onPress={onImport}>
            <Ionicons name="download-outline" size={20} color={Colors.textSecondary} />
            <View style={styles.itemText}>
              <Text style={styles.itemLabel}>{t('player.import', '가져오기')}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Reanalyze */}
          <TouchableOpacity style={styles.item} onPress={onReanalyze}>
            <Ionicons name="refresh-outline" size={20} color={Colors.textSecondary} />
            <View style={styles.itemText}>
              <Text style={styles.itemLabel}>{t('player.reanalyze', '재분석')}</Text>
            </View>
          </TouchableOpacity>

          {/* BPM */}
          <TouchableOpacity style={styles.item} onPress={onEditBpm}>
            <Ionicons name="musical-notes-outline" size={20} color={Colors.textSecondary} />
            <View style={styles.itemText}>
              <Text style={styles.itemLabel}>BPM</Text>
            </View>
            <Text style={styles.itemValue}>{Math.round(bpm)}</Text>
          </TouchableOpacity>

          {/* Stage config (formation mode only) */}
          {stageConfig && onStageConfigChange && (
            <>
              <View style={styles.divider} />
              <View style={styles.item}>
                <Ionicons name="resize-outline" size={20} color={Colors.accent} />
                <View style={styles.itemText}>
                  <Text style={styles.itemLabel}>{t('player.stageSize', '무대 크기')}</Text>
                </View>
              </View>
              <View style={styles.stagePresetRow}>
                {STAGE_PRESETS.map((preset) => {
                  const isActive = stageConfig.gridWidth === preset.config.gridWidth
                    && stageConfig.gridHeight === preset.config.gridHeight;
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      style={[styles.stagePresetBtn, isActive && styles.stagePresetBtnActive]}
                      onPress={() => onStageConfigChange(preset.config)}
                    >
                      <Text style={[styles.stagePresetText, isActive && styles.stagePresetTextActive]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.stageSizeRow}>
                <View style={styles.stageSizeItem}>
                  <Text style={styles.stageSizeLabel}>{t('player.width', '가로')}</Text>
                  <View style={styles.offsetControls}>
                    <TouchableOpacity
                      style={styles.offsetBtn}
                      onPress={() => onStageConfigChange({ ...stageConfig, gridWidth: Math.max(4, stageConfig.gridWidth - 1) })}
                    >
                      <Text style={styles.offsetBtnText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.stageSizeValue}>{stageConfig.gridWidth}m</Text>
                    <TouchableOpacity
                      style={styles.offsetBtn}
                      onPress={() => onStageConfigChange({ ...stageConfig, gridWidth: Math.min(16, stageConfig.gridWidth + 1) })}
                    >
                      <Text style={styles.offsetBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.stageSizeItem}>
                  <Text style={styles.stageSizeLabel}>{t('player.depth', '세로')}</Text>
                  <View style={styles.offsetControls}>
                    <TouchableOpacity
                      style={styles.offsetBtn}
                      onPress={() => onStageConfigChange({ ...stageConfig, gridHeight: Math.max(2, stageConfig.gridHeight - 1) })}
                    >
                      <Text style={styles.offsetBtnText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.stageSizeValue}>{stageConfig.gridHeight}m</Text>
                    <TouchableOpacity
                      style={styles.offsetBtn}
                      onPress={() => onStageConfigChange({ ...stageConfig, gridHeight: Math.min(10, stageConfig.gridHeight + 1) })}
                    >
                      <Text style={styles.offsetBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </>
          )}

          <View style={styles.divider} />

          {/* Reset all */}
          <TouchableOpacity style={styles.item} onPress={onResetAll}>
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
            <View style={styles.itemText}>
              <Text style={[styles.itemLabel, { color: Colors.error }]}>{t('common.reset', '전체 리셋')}</Text>
            </View>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '85%',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  itemText: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 13,
    color: Colors.text,
  },
  itemDesc: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  itemValue: {
    fontSize: 12,
    color: Colors.primary,
  },
  offsetControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  offsetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  offsetBtnText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  offsetCenter: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  offsetValue: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  stagePresetRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  stagePresetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stagePresetBtnActive: {
    backgroundColor: 'rgba(187,134,252,0.2)',
    borderColor: Colors.primary,
  },
  stagePresetText: { fontSize: 11, color: Colors.textSecondary },
  stagePresetTextActive: { color: Colors.primary, fontWeight: '700' },
  stageSizeRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  stageSizeItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageSizeLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  stageSizeValue: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
});
