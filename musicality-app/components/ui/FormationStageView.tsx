import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Dimensions,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DancerDef,
  DancerPosition,
  FormationData,
  FormationKeyframe,
  PatternId,
} from '../../types/formation';
import {
  getFormationAtBeat,
  hasKeyframeAtBeat,
  setKeyframe,
  removeKeyframe,
  copyKeyframe,
} from '../../utils/formationInterpolator';
import { Colors, FontSize, Spacing } from '../../constants/theme';

// ─── Pattern templates (client-side for quick apply) ─────
const PATTERN_TEMPLATES: { id: PatternId; label: string; icon: string }[] = [
  { id: 'pairs-facing', label: 'Pairs', icon: 'people' },
  { id: 'line', label: 'Line', icon: 'remove' },
  { id: 'circle', label: 'Circle', icon: 'ellipse-outline' },
  { id: 'v-shape', label: 'V-Shape', icon: 'chevron-down-outline' },
  { id: 'diamond', label: 'Diamond', icon: 'diamond-outline' },
  { id: 'two-lines', label: '2 Lines', icon: 'reorder-two' },
  { id: 'staggered', label: 'Stagger', icon: 'grid-outline' },
  { id: 'scatter', label: 'Scatter', icon: 'sparkles-outline' },
];

// Simple client-side pattern generators (mirrors server logic)
function generatePattern(patternId: PatternId, n: number): DancerPosition[] {
  const dancers: string[] = [];
  const pairs = Math.ceil(n / 2);
  for (let i = 0; i < pairs; i++) {
    dancers.push(`L${i + 1}`);
    if (dancers.length < n) dancers.push(`F${i + 1}`);
  }

  const positions: DancerPosition[] = [];
  const coords = PATTERN_COORDS[patternId]?.(n) ?? defaultCoords(n);
  for (let i = 0; i < n; i++) {
    positions.push({
      dancerId: dancers[i],
      x: coords[i]?.[0] ?? 0.5,
      y: coords[i]?.[1] ?? 0.5,
    });
  }
  return positions;
}

type CoordFn = (n: number) => [number, number][];

const PATTERN_COORDS: Record<string, CoordFn> = {
  'pairs-facing': (n) => {
    const p = Math.floor(n / 2);
    const res: [number, number][] = [];
    for (let i = 0; i < p; i++) {
      const x = p > 1 ? 0.3 + 0.4 * i / (p - 1) : 0.5;
      res.push([x, 0.35], [x, 0.65]);
    }
    if (n % 2) res.push([0.5, 0.5]);
    return res.slice(0, n);
  },
  'line': (n) => Array.from({ length: n }, (_, i) => [
    n > 1 ? 0.1 + 0.8 * i / (n - 1) : 0.5, 0.5,
  ] as [number, number]),
  'circle': (n) => Array.from({ length: n }, (_, i) => [
    0.5 + 0.28 * Math.cos(2 * Math.PI * i / n),
    0.5 + 0.28 * Math.sin(2 * Math.PI * i / n),
  ] as [number, number]),
  'v-shape': (n) => {
    const res: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2;
      const depth = Math.floor(i / 2);
      const maxD = Math.max(1, Math.floor((n - 1) / 2));
      const xOff = 0.15 + 0.2 * depth / maxD;
      const y = 0.3 + 0.4 * depth / maxD;
      res.push([side === 0 ? 0.5 - xOff : 0.5 + xOff, y]);
    }
    return res;
  },
  'diamond': (n) => {
    if (n <= 2) return [[0.5, 0.35], [0.5, 0.65]].slice(0, n) as [number, number][];
    if (n <= 4) return [[0.5, 0.25], [0.3, 0.5], [0.7, 0.5], [0.5, 0.75]].slice(0, n) as [number, number][];
    const res: [number, number][] = [[0.5, 0.2], [0.5, 0.8], [0.2, 0.5], [0.8, 0.5]];
    for (let i = 4; i < n; i++) {
      const a = Math.PI / 4 + (2 * Math.PI * (i - 4)) / Math.max(1, n - 4);
      res.push([0.5 + 0.22 * Math.cos(a), 0.5 + 0.22 * Math.sin(a)]);
    }
    return res;
  },
  'two-lines': (n) => {
    const front = Math.floor(n / 2);
    const back = n - front;
    const res: [number, number][] = [];
    for (let i = 0; i < back; i++) {
      res.push([back > 1 ? 0.15 + 0.7 * i / (back - 1) : 0.5, 0.35]);
    }
    for (let i = 0; i < front; i++) {
      res.push([front > 1 ? 0.15 + 0.7 * i / (front - 1) : 0.5, 0.65]);
    }
    return res;
  },
  'staggered': (n) => {
    const cols = Math.min(n, 4);
    const rows = Math.ceil(n / cols);
    const res: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
      const y = rows > 1 ? 0.2 + 0.6 * r / (rows - 1) : 0.5;
      const rc = Math.min(cols, n - r * cols);
      const xOff = r % 2 === 1 ? 0.05 : 0;
      for (let c = 0; c < rc; c++) {
        const x = cols > 1 ? 0.15 + xOff + 0.7 * c / (cols - 1) : 0.5;
        res.push([Math.min(0.95, Math.max(0.05, x)), y]);
      }
    }
    return res;
  },
  'scatter': (n) => {
    const phi = (1 + Math.sqrt(5)) / 2;
    return Array.from({ length: n }, (_, i) => [
      0.15 + 0.7 * ((i * phi) % 1),
      0.15 + 0.7 * ((i * phi * phi) % 1),
    ] as [number, number]);
  },
  'pairs-side': (n) => {
    const p = Math.floor(n / 2);
    const res: [number, number][] = [];
    for (let i = 0; i < p; i++) {
      const x = p > 1 ? 0.15 + 0.7 * i / (p - 1) : 0.5;
      res.push([x, 0.48], [x + 0.05, 0.52]);
    }
    if (n % 2) res.push([0.5, 0.5]);
    return res.slice(0, n);
  },
};

function defaultCoords(n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [
    0.2 + 0.6 * (i % 4) / 3,
    0.2 + 0.6 * Math.floor(i / 4) / 2,
  ]);
}

// ─── Props ──────────────────────────────────────────
interface FormationStageViewProps {
  visible: boolean;
  formationData: FormationData;
  currentBeatIndex: number;
  totalBeats: number;
  onUpdate: (data: FormationData) => void;
  onClose: () => void;
  onBeatChange?: (beatIndex: number) => void;
}

const STAGE_PADDING = 16;
const DANCER_RADIUS = 18;

export function FormationStageView({
  visible,
  formationData,
  currentBeatIndex,
  totalBeats,
  onUpdate,
  onClose,
  onBeatChange,
}: FormationStageViewProps) {
  const [selectedDancerId, setSelectedDancerId] = useState<string | null>(null);
  const [dragDancerId, setDragDancerId] = useState<string | null>(null);
  const stageRef = useRef<View>(null);
  const stageLayoutRef = useRef({ x: 0, y: 0, size: 0 });

  const screenWidth = Dimensions.get('window').width;
  const stageSize = screenWidth - STAGE_PADDING * 2 - 32;

  // Current positions (from keyframe or interpolated)
  const currentPositions = useMemo(
    () => getFormationAtBeat(formationData, currentBeatIndex),
    [formationData, currentBeatIndex],
  );

  const isKeyframe = useMemo(
    () => hasKeyframeAtBeat(formationData, currentBeatIndex),
    [formationData, currentBeatIndex],
  );

  // ─── Dancer drag ──────────────────────────────────
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const normX = locationX / stageSize;
          const normY = locationY / stageSize;
          // Find closest dancer
          if (!currentPositions) return;
          let closest: string | null = null;
          let closestDist = 999;
          for (const pos of currentPositions) {
            const dist = Math.hypot(pos.x - normX, pos.y - normY);
            if (dist < closestDist && dist < 0.1) {
              closestDist = dist;
              closest = pos.dancerId;
            }
          }
          if (closest) {
            setDragDancerId(closest);
            setSelectedDancerId(closest);
          }
        },
        onPanResponderMove: (evt) => {
          if (!dragDancerId || !currentPositions) return;
          const { locationX, locationY } = evt.nativeEvent;
          const normX = Math.max(0.05, Math.min(0.95, locationX / stageSize));
          const normY = Math.max(0.05, Math.min(0.95, locationY / stageSize));

          const newPositions = currentPositions.map((p) =>
            p.dancerId === dragDancerId ? { ...p, x: normX, y: normY } : p,
          );

          const keyframe: FormationKeyframe = {
            beatIndex: currentBeatIndex,
            positions: newPositions.map((p) => ({
              dancerId: p.dancerId,
              x: Math.round(p.x * 1000) / 1000,
              y: Math.round(p.y * 1000) / 1000,
            })),
          };
          onUpdate(setKeyframe(formationData, keyframe));
        },
        onPanResponderRelease: () => {
          setDragDancerId(null);
        },
      }),
    [dragDancerId, currentPositions, currentBeatIndex, formationData, stageSize, onUpdate],
  );

  // ─── Actions ──────────────────────────────────────
  const handleApplyPattern = useCallback(
    (patternId: PatternId) => {
      const positions = generatePattern(patternId, formationData.dancers.length);
      // Map to actual dancer IDs
      const mapped = positions.map((p, i) => ({
        ...p,
        dancerId: formationData.dancers[i]?.id ?? p.dancerId,
      }));
      const keyframe: FormationKeyframe = {
        beatIndex: currentBeatIndex,
        positions: mapped,
      };
      onUpdate(setKeyframe(formationData, keyframe));
    },
    [formationData, currentBeatIndex, onUpdate],
  );

  const handleDeleteKeyframe = useCallback(() => {
    onUpdate(removeKeyframe(formationData, currentBeatIndex));
  }, [formationData, currentBeatIndex, onUpdate]);

  const handleCopyFromPrev = useCallback(() => {
    // Find previous keyframe's beat
    const prev = formationData.keyframes
      .filter((kf) => kf.beatIndex < currentBeatIndex)
      .sort((a, b) => b.beatIndex - a.beatIndex)[0];
    if (prev) {
      onUpdate(copyKeyframe(formationData, prev.beatIndex, currentBeatIndex));
    }
  }, [formationData, currentBeatIndex, onUpdate]);

  const handleBeatNav = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(totalBeats - 1, currentBeatIndex + delta));
      onBeatChange?.(next);
    },
    [currentBeatIndex, totalBeats, onBeatChange],
  );

  // ─── Render ───────────────────────────────────────
  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Formation Editor</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>
        </View>

        {/* Beat navigation */}
        <View style={styles.beatNav}>
          <Pressable onPress={() => handleBeatNav(-8)} style={styles.navBtn}>
            <Ionicons name="play-skip-back" size={18} color={Colors.text} />
          </Pressable>
          <Pressable onPress={() => handleBeatNav(-1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </Pressable>
          <View style={styles.beatLabel}>
            <Text style={styles.beatText}>Beat {currentBeatIndex + 1}</Text>
            <Text style={styles.beatSubtext}>
              {isKeyframe ? '● Keyframe' : '○ Interpolated'}
            </Text>
          </View>
          <Pressable onPress={() => handleBeatNav(1)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={Colors.text} />
          </Pressable>
          <Pressable onPress={() => handleBeatNav(8)} style={styles.navBtn}>
            <Ionicons name="play-skip-forward" size={18} color={Colors.text} />
          </Pressable>
        </View>

        {/* Stage */}
        <View style={styles.stageContainer}>
          <Text style={styles.stageLabel}>AUDIENCE</Text>
          <View
            ref={stageRef}
            style={[styles.stage, { width: stageSize, height: stageSize }]}
            {...panResponder.panHandlers}
          >
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((p) => (
              <View
                key={`h-${p}`}
                style={[styles.gridLine, { top: p * stageSize, width: stageSize }]}
                pointerEvents="none"
              />
            ))}
            {[0.25, 0.5, 0.75].map((p) => (
              <View
                key={`v-${p}`}
                style={[styles.gridLineV, { left: p * stageSize, height: stageSize }]}
                pointerEvents="none"
              />
            ))}

            {/* Dancers */}
            {currentPositions?.map((pos) => {
              const dancer = formationData.dancers.find((d) => d.id === pos.dancerId);
              if (!dancer) return null;
              const isSelected = selectedDancerId === dancer.id;
              const isDragging = dragDancerId === dancer.id;
              const displayName = dancer.crewMemberName || dancer.label;
              const shortName = displayName.length > 6
                ? displayName.slice(0, 5) + '…'
                : displayName;

              return (
                <View
                  key={dancer.id}
                  style={[
                    styles.dancer,
                    {
                      left: pos.x * stageSize - DANCER_RADIUS,
                      top: pos.y * stageSize - DANCER_RADIUS,
                      backgroundColor: dancer.color,
                      borderColor: isSelected ? '#FFFFFF' : 'transparent',
                      transform: [{ scale: isDragging ? 1.2 : 1 }],
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Text style={styles.dancerLabel}>{dancer.id}</Text>
                </View>
              );
            })}

            {/* Selected dancer name overlay */}
            {currentPositions?.map((pos) => {
              const dancer = formationData.dancers.find((d) => d.id === pos.dancerId);
              if (!dancer) return null;
              const displayName = dancer.crewMemberName || dancer.label;
              const shortName = displayName.length > 8
                ? displayName.slice(0, 7) + '…'
                : displayName;
              return (
                <Text
                  key={`name-${dancer.id}`}
                  style={[
                    styles.dancerName,
                    {
                      left: pos.x * stageSize - 30,
                      top: pos.y * stageSize + DANCER_RADIUS + 2,
                    },
                  ]}
                  pointerEvents="none"
                  numberOfLines={1}
                >
                  {shortName}
                </Text>
              );
            })}
          </View>
          <Text style={styles.stageLabel}>BACK</Text>
        </View>

        {/* Pattern templates */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Patterns</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.patternRow}>
          {PATTERN_TEMPLATES.map((pt) => (
            <Pressable
              key={pt.id}
              style={styles.patternBtn}
              onPress={() => handleApplyPattern(pt.id)}
            >
              <Ionicons name={pt.icon as any} size={18} color={Colors.text} />
              <Text style={styles.patternLabel}>{pt.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Keyframe actions */}
        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={handleCopyFromPrev}>
            <Ionicons name="copy-outline" size={18} color={Colors.text} />
            <Text style={styles.actionText}>Copy Prev</Text>
          </Pressable>
          {isKeyframe && (
            <Pressable style={styles.actionBtn} onPress={handleDeleteKeyframe}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
              <Text style={[styles.actionText, { color: Colors.error }]}>Delete KF</Text>
            </Pressable>
          )}
        </View>

        {/* Keyframe strip (mini preview of nearby beats) */}
        <View style={styles.stripContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {Array.from({ length: Math.min(totalBeats, 32) }, (_, i) => {
              const bi = Math.max(0, currentBeatIndex - 16) + i;
              if (bi >= totalBeats) return null;
              const isKf = hasKeyframeAtBeat(formationData, bi);
              const isCurrent = bi === currentBeatIndex;
              return (
                <Pressable
                  key={bi}
                  style={[
                    styles.stripCell,
                    isCurrent && styles.stripCellActive,
                    isKf && styles.stripCellKeyframe,
                  ]}
                  onPress={() => onBeatChange?.(bi)}
                >
                  <Text style={[styles.stripText, isCurrent && styles.stripTextActive]}>
                    {(bi % 8) + 1}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 60,
    paddingHorizontal: STAGE_PADDING,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  beatNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  beatLabel: {
    alignItems: 'center',
    minWidth: 100,
  },
  beatText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  beatSubtext: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  stageContainer: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  stageLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginVertical: 2,
  },
  stage: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dancer: {
    position: 'absolute',
    width: DANCER_RADIUS * 2,
    height: DANCER_RADIUS * 2,
    borderRadius: DANCER_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  dancerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dancerName: {
    position: 'absolute',
    width: 60,
    fontSize: 9,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  sectionHeader: {
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  patternRow: {
    maxHeight: 56,
    marginBottom: Spacing.sm,
  },
  patternBtn: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  patternLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  actionText: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  stripContainer: {
    height: 36,
    marginBottom: Spacing.md,
  },
  stripCell: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 3,
  },
  stripCellActive: {
    backgroundColor: Colors.primary,
  },
  stripCellKeyframe: {
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  stripText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  stripTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
