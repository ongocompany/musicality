/**
 * SlotBar — 슬롯 선택 바 (헤더 아래 펼침/접힘)
 *
 * Phrase Edit: 보라색 [1 2 3] [R] [커뮤니티...]
 * Formation Edit: 금색 [1 2 3] [커뮤니티...]
 *
 * - 내 슬롯 (1/2/3): 편집 + 자동저장 가능
 * - R (서버 분석): 읽기전용 (Phrase only)
 * - 커뮤니티: 읽기전용
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Colors, Spacing } from '../../constants/theme';
import { EditionId } from '../../types/analysis';
import { FormationEditionId } from '../../types/formation';
import { ImportedPhraseNote } from '../../types/phraseNote';

type SlotMode = 'phrase' | 'formation';

interface SlotBarProps {
  mode: SlotMode;
  activeSlot: string; // EditionId or 'imported-{id}'
  hasServerEdition: boolean;
  userSlotCount: number; // 현재 생성된 유저 슬롯 수 (0~3)
  importedNotes: ImportedPhraseNote[];
  onSelectSlot: (slotId: string) => void;
  onClose: () => void;
}

const PHRASE_COLOR = Colors.primary;       // 보라색
const FORMATION_COLOR = '#FFB300';         // 금색

export function SlotBar({
  mode, activeSlot, hasServerEdition, userSlotCount,
  importedNotes, onSelectSlot, onClose,
}: SlotBarProps) {
  const color = mode === 'phrase' ? PHRASE_COLOR : FORMATION_COLOR;
  const userSlots: string[] = ['1', '2', '3'];

  const handleSelect = (slotId: string) => {
    onSelectSlot(slotId);
    onClose();
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* 내 슬롯 1, 2, 3 */}
        {userSlots.map((slot) => {
          const isActive = activeSlot === slot;
          return (
            <TouchableOpacity
              key={slot}
              style={[styles.slot, isActive && { backgroundColor: color + '30', borderColor: color }]}
              onPress={() => handleSelect(slot)}
            >
              <Text style={[styles.slotText, { color: isActive ? color : Colors.textSecondary }]}>
                {slot}
              </Text>
              {isActive && <View style={[styles.activeDot, { backgroundColor: color }]} />}
            </TouchableOpacity>
          );
        })}

        {/* R — 서버 분석 (Phrase only) */}
        {mode === 'phrase' && hasServerEdition && (
          <>
            <View style={styles.separator} />
            <TouchableOpacity
              style={[styles.slot, activeSlot === 'S' && { backgroundColor: color + '30', borderColor: color }]}
              onPress={() => handleSelect('S')}
            >
              <Text style={[styles.slotText, { color: activeSlot === 'S' ? color : Colors.textSecondary }]}>
                R
              </Text>
              {activeSlot === 'S' && <View style={[styles.activeDot, { backgroundColor: color }]} />}
            </TouchableOpacity>
          </>
        )}

        {/* 커뮤니티 슬롯 */}
        {importedNotes.length > 0 && (
          <>
            <View style={styles.separator} />
            {importedNotes.map((note) => {
              const noteSlotId = `imported-${note.id}`;
              const isActive = activeSlot === noteSlotId;
              const initial = note.phraseNote.metadata.author?.charAt(0) || '?';
              return (
                <TouchableOpacity
                  key={note.id}
                  style={[styles.slot, styles.communitySlot, isActive && { backgroundColor: Colors.accent + '30', borderColor: Colors.accent }]}
                  onPress={() => handleSelect(noteSlotId)}
                >
                  <Text style={[styles.slotText, { color: isActive ? Colors.accent : Colors.textMuted }]}>
                    {initial}
                  </Text>
                  {isActive && <View style={[styles.activeDot, { backgroundColor: Colors.accent }]} />}
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** 헤더 배지에 표시할 슬롯 레이블 */
export function getSlotLabel(activeSlot: string, importedNotes: ImportedPhraseNote[]): string {
  if (activeSlot === 'S') return 'R';
  if (activeSlot.startsWith('imported-')) {
    const note = importedNotes.find(n => `imported-${n.id}` === activeSlot);
    return note?.phraseNote.metadata.author?.charAt(0) || '?';
  }
  return activeSlot; // '1', '2', '3'
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(18,18,18,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface,
    paddingVertical: 6,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  slot: {
    width: 36,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  communitySlot: {
    width: 36,
  },
  slotText: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeDot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  separator: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
    marginHorizontal: 2,
  },
});
