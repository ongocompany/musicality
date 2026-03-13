import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  PanResponder,
  Dimensions,
  ScrollView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DancerDef,
  DancerPosition,
  FormationData,
  FormationKeyframe,
  PatternId,
  StageConfig,
  STAGE_PRESETS,
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
  { id: 'v-shape', label: 'V', icon: 'chevron-down-outline' },
  { id: 'diamond', label: 'Diamond', icon: 'diamond-outline' },
  { id: 'two-lines', label: '2Lines', icon: 'reorder-two' },
  { id: 'staggered', label: 'Stagger', icon: 'grid-outline' },
  { id: 'scatter', label: 'Scatter', icon: 'sparkles-outline' },
];

// ─── Pattern coordinate generators ──────────────────────
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
    0.5 + 0.28 * Math.cos(2 * Math.PI * i / n - Math.PI / 2),
    0.5 + 0.28 * Math.sin(2 * Math.PI * i / n - Math.PI / 2),
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

// ─── Constants ──────────────────────────────────────────
const DOT_RADIUS = 6;
const HIT_RADIUS = 24; // touch hit area
const BACKSTAGE_RATIO = 0.12; // backstage height as fraction of stage

const COLOR_PALETTE = [
  '#4488FF', '#2196F3', '#1565C0', '#00BCD4',
  '#4CAF50', '#8BC34A', '#FF6B9D', '#E91E63',
  '#FF5722', '#FF9800', '#FFC107', '#9C27B0',
  '#CE93D8', '#A1887F', '#78909C', '#FFFFFF',
];

// ─── Props ──────────────────────────────────────────────
interface FormationStageViewProps {
  formationData: FormationData;
  currentBeatIndex: number;
  totalBeats: number;
  stageConfig: StageConfig;
  isPlaying: boolean;
  isEditing: boolean;
  onUpdate: (data: FormationData) => void;
  onBeatChange?: (beatIndex: number) => void;
  onStageConfigChange?: (config: Partial<StageConfig>) => void;
}

export function FormationStageView({
  formationData,
  currentBeatIndex,
  totalBeats,
  stageConfig,
  isPlaying,
  isEditing,
  onUpdate,
  onBeatChange,
  onStageConfigChange,
}: FormationStageViewProps) {
  const [selectedDancerIds, setSelectedDancerIds] = useState<Set<string>>(new Set());
  const [dragDancerId, setDragDancerId] = useState<string | null>(null);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [editingDancerId, setEditingDancerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const screenWidth = Dimensions.get('window').width;
  const stageWidth = screenWidth - 16; // minimal horizontal padding
  const stageHeight = stageWidth * (stageConfig.gridHeight / stageConfig.gridWidth);
  const backstageHeight = stageHeight * BACKSTAGE_RATIO;
  const totalHeight = stageHeight + backstageHeight;

  // Current positions (from keyframe or interpolated)
  const currentPositions = useMemo(
    () => getFormationAtBeat(formationData, currentBeatIndex),
    [formationData, currentBeatIndex],
  );

  const isKeyframe = useMemo(
    () => hasKeyframeAtBeat(formationData, currentBeatIndex),
    [formationData, currentBeatIndex],
  );

  // ─── Animated positions for smooth playback ─────────
  const animatedPositions = useRef<Map<string, { x: Animated.Value; y: Animated.Value }>>(new Map());

  // Ensure animated values exist for all dancers
  useEffect(() => {
    for (const dancer of formationData.dancers) {
      if (!animatedPositions.current.has(dancer.id)) {
        animatedPositions.current.set(dancer.id, {
          x: new Animated.Value(0.5),
          y: new Animated.Value(0.5),
        });
      }
    }
  }, [formationData.dancers]);

  // Update animated positions when beat changes
  useEffect(() => {
    if (!currentPositions) return;
    for (const pos of currentPositions) {
      const anim = animatedPositions.current.get(pos.dancerId);
      if (!anim) continue;
      if (isPlaying && !isEditing) {
        // Smooth animation during playback — duration covers most of the beat interval
        // so movement appears continuous (at 130 BPM, beat ≈ 460ms)
        Animated.timing(anim.x, {
          toValue: pos.x,
          duration: 350,
          useNativeDriver: false,
        }).start();
        Animated.timing(anim.y, {
          toValue: pos.y,
          duration: 350,
          useNativeDriver: false,
        }).start();
      } else {
        // Instant snap when editing or paused
        anim.x.setValue(pos.x);
        anim.y.setValue(pos.y);
      }
    }
  }, [currentPositions, isPlaying, isEditing]);

  // ─── Grid lines ─────────────────────────────────────
  const gridLines = useMemo(() => {
    const { gridWidth, gridHeight } = stageConfig;
    const hLines: number[] = [];
    const vLines: number[] = [];
    // Vertical lines (gridWidth + 1 lines including borders)
    for (let i = 0; i <= gridWidth; i++) vLines.push(i / gridWidth);
    // Horizontal lines (gridHeight + 1 lines including borders)
    for (let i = 0; i <= gridHeight; i++) hLines.push(i / gridHeight);
    return { hLines, vLines };
  }, [stageConfig]);

  // ─── Touch handling ─────────────────────────────────
  const findClosestDancer = useCallback(
    (normX: number, normY: number): string | null => {
      if (!currentPositions) return null;
      let closest: string | null = null;
      let closestDist = Infinity;
      const hitNormX = HIT_RADIUS / stageWidth;
      const hitNormY = HIT_RADIUS / stageHeight;
      for (const pos of currentPositions) {
        // Scale distance by aspect ratio so hit area is circular in pixels
        const dx = (pos.x - normX) / hitNormX;
        const dy = (pos.y - normY) / hitNormY;
        const dist = Math.hypot(dx, dy);
        if (dist < 1.0 && dist < closestDist) {
          closestDist = dist;
          closest = pos.dancerId;
        }
      }
      return closest;
    },
    [currentPositions, stageWidth],
  );

  const panResponder = useMemo(() => {
    if (!isEditing) return PanResponder.create({});
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        // Map to stage coords (backstage = negative normY)
        const stageY = locationY - backstageHeight;
        const normX = locationX / stageWidth;
        const normY = stageY / stageHeight;

        const dancer = findClosestDancer(normX, normY);
        if (dancer) {
          setDragDancerId(dancer);
          // Start long-press timer
          longPressTimerRef.current = setTimeout(() => {
            handleLongPressDancer(dancer);
            setDragDancerId(null);
          }, 500);
        } else {
          // Tap on empty space → deselect all + close popup
          setSelectedDancerIds(new Set());
          if (editingDancerId) {
            handleNameConfirm();
          }
        }
      },
      onPanResponderMove: (evt) => {
        // Cancel long-press on move
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        if (!dragDancerId || !currentPositions) return;
        const { locationX, locationY } = evt.nativeEvent;
        const stageY = locationY - backstageHeight;
        const normX = Math.max(0.02, Math.min(0.98, locationX / stageWidth));
        // Allow negative normY for backstage placement
        const normY = Math.max(-backstageHeight / stageHeight, Math.min(0.98, stageY / stageHeight));

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
      onPanResponderRelease: (evt) => {
        // If long-press timer still active, it's a tap → toggle selection
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
          if (dragDancerId) {
            setSelectedDancerIds((prev) => {
              const next = new Set(prev);
              if (next.has(dragDancerId)) next.delete(dragDancerId);
              else next.add(dragDancerId);
              return next;
            });
          }
        }
        setDragDancerId(null);
      },
    });
  }, [isEditing, dragDancerId, currentPositions, currentBeatIndex, formationData, stageWidth, stageHeight, backstageHeight, onUpdate, findClosestDancer]);

  // ─── Long press handler ─────────────────────────────
  const handleLongPressDancer = useCallback(
    (dancerId: string) => {
      const dancer = formationData.dancers.find((d) => d.id === dancerId);
      if (!dancer) return;
      setEditingDancerId(dancerId);
      setEditingName(dancer.crewMemberName || dancer.label);
    },
    [formationData],
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (!editingDancerId) return;
      const updatedDancers = formationData.dancers.map((d) =>
        d.id === editingDancerId ? { ...d, color } : d,
      );
      onUpdate({ ...formationData, dancers: updatedDancers });
    },
    [editingDancerId, formationData, onUpdate],
  );

  const handleNameConfirm = useCallback(() => {
    if (!editingDancerId) return;
    const trimmed = editingName.trim();
    if (trimmed) {
      const updatedDancers = formationData.dancers.map((d) =>
        d.id === editingDancerId ? { ...d, crewMemberName: trimmed } : d,
      );
      onUpdate({ ...formationData, dancers: updatedDancers });
    }
    setEditingDancerId(null);
  }, [editingDancerId, editingName, formationData, onUpdate]);

  const editingDancer = editingDancerId
    ? formationData.dancers.find((d) => d.id === editingDancerId)
    : null;

  // ─── Actions ────────────────────────────────────────
  const handleApplyPattern = useCallback(
    (patternId: PatternId) => {
      const positions = generatePattern(patternId, formationData.dancers.length);
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
    const prev = formationData.keyframes
      .filter((kf) => kf.beatIndex < currentBeatIndex)
      .sort((a, b) => b.beatIndex - a.beatIndex)[0];
    if (prev) {
      onUpdate(copyKeyframe(formationData, prev.beatIndex, currentBeatIndex));
    }
  }, [formationData, currentBeatIndex, onUpdate]);

  // ─── Add / Remove dancers ─────────────────────────
  const DANCER_COLORS = ['#4FC3F7', '#F48FB1', '#81C784', '#FFB74D', '#CE93D8', '#A1887F', '#4DD0E1', '#FF8A65', '#AED581', '#F06292', '#7986CB', '#DCE775'];

  const handleAddDancer = useCallback(() => {
    if (formationData.dancers.length >= 12) return;
    const idx = formationData.dancers.length;
    const role = idx % 2 === 0 ? 'leader' as const : 'follower' as const;
    const newDancer: DancerDef = {
      id: `D${idx + 1}`,
      label: `${role === 'leader' ? 'L' : 'F'}${Math.ceil((idx + 1) / 2)}`,
      role,
      color: DANCER_COLORS[idx % DANCER_COLORS.length],
    };
    // Place new dancer in backstage (offstage, y < 0 in normalized coords)
    const backstageX = 0.1 + (idx % 6) * 0.15;
    const newData: FormationData = {
      ...formationData,
      dancers: [...formationData.dancers, newDancer],
      keyframes: formationData.keyframes.map((kf) => ({
        ...kf,
        positions: [...kf.positions, { dancerId: newDancer.id, x: backstageX, y: -0.1, offstage: true }],
      })),
    };
    onUpdate(newData);
  }, [formationData, onUpdate]);

  const handleRemoveDancer = useCallback(() => {
    if (formationData.dancers.length <= 1) return;
    const removedId = formationData.dancers[formationData.dancers.length - 1].id;
    const newData: FormationData = {
      ...formationData,
      dancers: formationData.dancers.slice(0, -1),
      keyframes: formationData.keyframes.map((kf) => ({
        ...kf,
        positions: kf.positions.filter((p) => p.dancerId !== removedId),
      })),
    };
    onUpdate(newData);
  }, [formationData, onUpdate]);

  const handleBeatNav = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(totalBeats - 1, currentBeatIndex + delta));
      onBeatChange?.(next);
    },
    [currentBeatIndex, totalBeats, onBeatChange],
  );

  // ─── Render ─────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Stage config row */}
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Stage</Text>
        <Pressable
          style={styles.sizeBtn}
          onPress={() => setShowSizeMenu(!showSizeMenu)}
        >
          <Text style={styles.sizeBtnText}>
            {stageConfig.gridWidth}×{stageConfig.gridHeight}m
          </Text>
          <Ionicons name="chevron-down" size={12} color={Colors.textSecondary} />
        </Pressable>
        {isEditing && (
          <View style={styles.configActions}>
            <Pressable onPress={handleRemoveDancer} hitSlop={8} style={styles.dancerCountBtn}>
              <Ionicons name="remove-circle-outline" size={18} color={formationData.dancers.length <= 1 ? Colors.textMuted : Colors.textSecondary} />
            </Pressable>
            <Text style={styles.dancerCountLabel}>{formationData.dancers.length}</Text>
            <Pressable onPress={handleAddDancer} hitSlop={8} style={styles.dancerCountBtn}>
              <Ionicons name="add-circle-outline" size={18} color={formationData.dancers.length >= 12 ? Colors.textMuted : Colors.textSecondary} />
            </Pressable>
            <Text style={styles.beatIndicator}>
              Beat {currentBeatIndex + 1}
              <Text style={{ color: isKeyframe ? Colors.accent : Colors.textMuted }}>
                {isKeyframe ? ' ●' : ' ○'}
              </Text>
            </Text>
          </View>
        )}
        {!isEditing && (
          <Text style={styles.playbackHint}>
            {isPlaying ? '▶ Playing' : '⏸ Paused'}
          </Text>
        )}
      </View>

      {/* Size preset menu */}
      {showSizeMenu && (
        <View style={styles.sizeMenu}>
          {STAGE_PRESETS.map((preset) => (
            <Pressable
              key={preset.label}
              style={[
                styles.sizeMenuItem,
                stageConfig.gridWidth === preset.config.gridWidth &&
                  stageConfig.gridHeight === preset.config.gridHeight &&
                  styles.sizeMenuItemActive,
              ]}
              onPress={() => {
                onStageConfigChange?.(preset.config);
                setShowSizeMenu(false);
              }}
            >
              <Text style={styles.sizeMenuText}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Stage area — panResponder on outer so backstage dots are draggable */}
      <View
        style={[styles.stageOuter, { width: stageWidth, height: totalHeight }]}
        {...panResponder.panHandlers}
      >
        {/* Backstage (top) */}
        <View style={[styles.backstage, { height: backstageHeight }]} pointerEvents="none">
          <Text style={styles.backstageLabel}>BACKSTAGE</Text>
        </View>

        {/* Main stage */}
        <View
          style={[styles.stage, { width: stageWidth, height: stageHeight }]}
          pointerEvents="none"
        >
          {/* Grid lines */}
          {gridLines.hLines.map((p, i) => (
            <View
              key={`h-${i}`}
              style={[
                styles.gridLine,
                {
                  top: p * stageHeight,
                  width: stageWidth,
                  backgroundColor:
                    i === 0 || i === gridLines.hLines.length - 1
                      ? 'rgba(255,255,255,0.15)'
                      : 'rgba(255,255,255,0.06)',
                },
              ]}
              pointerEvents="none"
            />
          ))}
          {gridLines.vLines.map((p, i) => (
            <View
              key={`v-${i}`}
              style={[
                styles.gridLineV,
                {
                  left: p * stageWidth,
                  height: stageHeight,
                  backgroundColor:
                    i === 0 || i === gridLines.vLines.length - 1
                      ? 'rgba(255,255,255,0.15)'
                      : 'rgba(255,255,255,0.06)',
                },
              ]}
              pointerEvents="none"
            />
          ))}

          {/* Audience indicator (bottom edge) */}
          <View
            style={[styles.audienceLine, { top: stageHeight - 2, width: stageWidth }]}
            pointerEvents="none"
          />
          <Text
            style={[styles.audienceLabel, { top: stageHeight - 14 }]}
            pointerEvents="none"
          >
            AUDIENCE ▼
          </Text>

        </View>

        {/* Dancers — rendered at stageOuter level so backstage dots are visible */}
        {currentPositions?.map((pos) => {
          const dancer = formationData.dancers.find((d) => d.id === pos.dancerId);
          if (!dancer) return null;
          const isSelected = selectedDancerIds.has(dancer.id);
          const isDragging = dragDancerId === dancer.id;
          const displayName = dancer.crewMemberName || dancer.label;
          const shortName =
            displayName.length > 8 ? displayName.slice(0, 7) + '…' : displayName;
          const isOffstage = pos.y < 0;

          const anim = animatedPositions.current.get(dancer.id);
          const useAnimated = isPlaying && !isEditing && anim;

          // Pixel coords: y is relative to stageOuter (backstage + stage)
          if (useAnimated) {
            const dotLeft = Animated.multiply(anim.x, stageWidth);
            const dotTop = Animated.add(
              Animated.multiply(anim.y, stageHeight),
              backstageHeight,
            );
            return (
              <View key={dancer.id} pointerEvents="none" style={StyleSheet.absoluteFill}>
                <Animated.Text
                  style={[
                    styles.dancerName,
                    {
                      left: Animated.subtract(dotLeft, 24),
                      top: Animated.subtract(dotTop, DOT_RADIUS + 12),
                    },
                  ]}
                  numberOfLines={1}
                >
                  {shortName}
                </Animated.Text>
                <Animated.View
                  style={[
                    styles.dancer,
                    {
                      left: Animated.subtract(dotLeft, DOT_RADIUS),
                      top: Animated.subtract(dotTop, DOT_RADIUS),
                      backgroundColor: dancer.color,
                    },
                  ]}
                />
              </View>
            );
          }

          // Static positioning (editing or paused)
          const pixelLeft = pos.x * stageWidth;
          const pixelTop = pos.y * stageHeight + backstageHeight;

          return (
            <View key={dancer.id} pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Text
                style={[
                  styles.dancerName,
                  {
                    left: pixelLeft - 24,
                    top: pixelTop - DOT_RADIUS - 12,
                    opacity: isOffstage ? 0.5 : 1,
                  },
                ]}
                numberOfLines={1}
              >
                {shortName}
              </Text>
              <View
                style={[
                  styles.dancer,
                  {
                    left: pixelLeft - DOT_RADIUS,
                    top: pixelTop - DOT_RADIUS,
                    backgroundColor: dancer.color,
                    opacity: isOffstage ? 0.5 : 1,
                    borderColor: isSelected
                      ? '#FFFFFF'
                      : isDragging
                      ? '#FFD700'
                      : 'transparent',
                    transform: [{ scale: isDragging ? 1.5 : 1 }],
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {/* Dancer edit popup (longpress) */}
      {editingDancer && (
        <View style={styles.dancerEditPopup}>
          <View style={styles.dancerEditHeader}>
            <View style={[styles.dancerEditDot, { backgroundColor: editingDancer.color }]} />
            <TextInput
              style={styles.dancerEditInput}
              value={editingName}
              onChangeText={setEditingName}
              onSubmitEditing={handleNameConfirm}
              placeholder="Name"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              selectTextOnFocus
            />
            <Text style={styles.dancerEditRole}>{editingDancer.role === 'leader' ? 'L' : 'F'}</Text>
            <Pressable onPress={handleNameConfirm} hitSlop={8} style={styles.dancerEditDone}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />
            </Pressable>
          </View>
          <View style={styles.colorPalette}>
            {COLOR_PALETTE.map((color) => (
              <Pressable
                key={color}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  editingDancer.color === color && styles.colorSwatchActive,
                ]}
                onPress={() => handleColorChange(color)}
              />
            ))}
          </View>
        </View>
      )}

      {/* Editing controls */}
      {isEditing && (
        <View style={styles.editControls}>
          {/* Beat navigation */}
          <View style={styles.beatNav}>
            <Pressable onPress={() => handleBeatNav(-8)} style={styles.navBtn} hitSlop={8}>
              <Ionicons name="play-skip-back" size={14} color={Colors.text} />
            </Pressable>
            <Pressable onPress={() => handleBeatNav(-1)} style={styles.navBtn} hitSlop={8}>
              <Ionicons name="chevron-back" size={16} color={Colors.text} />
            </Pressable>
            <View style={styles.beatLabelCenter}>
              <Text style={styles.beatText}>{currentBeatIndex + 1}/{totalBeats}</Text>
            </View>
            <Pressable onPress={() => handleBeatNav(1)} style={styles.navBtn} hitSlop={8}>
              <Ionicons name="chevron-forward" size={16} color={Colors.text} />
            </Pressable>
            <Pressable onPress={() => handleBeatNav(8)} style={styles.navBtn} hitSlop={8}>
              <Ionicons name="play-skip-forward" size={14} color={Colors.text} />
            </Pressable>
          </View>

          {/* Pattern templates + actions */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.toolRow}
            contentContainerStyle={styles.toolRowContent}
          >
            {PATTERN_TEMPLATES.map((pt) => (
              <Pressable
                key={pt.id}
                style={styles.toolBtn}
                onPress={() => handleApplyPattern(pt.id)}
              >
                <Ionicons name={pt.icon as any} size={14} color={Colors.text} />
                <Text style={styles.toolLabel}>{pt.label}</Text>
              </Pressable>
            ))}
            <View style={styles.toolDivider} />
            <Pressable style={styles.toolBtn} onPress={handleCopyFromPrev}>
              <Ionicons name="copy-outline" size={14} color={Colors.text} />
              <Text style={styles.toolLabel}>Copy</Text>
            </Pressable>
            {isKeyframe && (
              <Pressable style={styles.toolBtn} onPress={handleDeleteKeyframe}>
                <Ionicons name="trash-outline" size={14} color={Colors.error} />
                <Text style={[styles.toolLabel, { color: Colors.error }]}>Del</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Keyframe strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.stripRow}
            contentContainerStyle={styles.stripContent}
          >
            {Array.from({ length: Math.min(totalBeats, 40) }, (_, i) => {
              const bi = Math.max(0, currentBeatIndex - 20) + i;
              if (bi >= totalBeats) return null;
              const isKf = hasKeyframeAtBeat(formationData, bi);
              const isCurrent = bi === currentBeatIndex;
              return (
                <Pressable
                  key={bi}
                  style={[
                    styles.stripCell,
                    isCurrent && styles.stripCellActive,
                    isKf && !isCurrent && styles.stripCellKeyframe,
                  ]}
                  onPress={() => onBeatChange?.(bi)}
                >
                  <Text
                    style={[
                      styles.stripText,
                      isCurrent && styles.stripTextActive,
                    ]}
                  >
                    {(bi % 8) + 1}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xs,
  },
  // Config row
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
  },
  configLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  sizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  sizeBtnText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  configActions: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  dancerCountBtn: {
    padding: 2,
  },
  dancerCountLabel: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '600',
    minWidth: 16,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  beatIndicator: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  playbackHint: {
    flex: 1,
    textAlign: 'right',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  // Size menu
  sizeMenu: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingBottom: 4,
    gap: 6,
  },
  sizeMenuItem: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sizeMenuItemActive: {
    backgroundColor: Colors.primary,
  },
  sizeMenuText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '500',
  },
  // Stage
  stageOuter: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backstage: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backstageLabel: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 2,
    fontWeight: '600',
  },
  stage: {
    backgroundColor: Colors.surface,
    position: 'relative',
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    height: 1,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    width: 1,
  },
  audienceLine: {
    position: 'absolute',
    left: 0,
    height: 2,
    backgroundColor: 'rgba(255, 200, 50, 0.3)',
  },
  audienceLabel: {
    position: 'absolute',
    right: 6,
    fontSize: 7,
    color: 'rgba(255, 200, 50, 0.35)',
    letterSpacing: 1,
  },
  // Dancers
  dancer: {
    position: 'absolute',
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dancerName: {
    position: 'absolute',
    width: 48,
    fontSize: 8,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  // Edit controls
  editControls: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  beatNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 4,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  beatLabelCenter: {
    minWidth: 70,
    alignItems: 'center',
  },
  beatText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  // Tool row (patterns + actions)
  toolRow: {
    maxHeight: 40,
    marginBottom: 4,
  },
  toolRowContent: {
    gap: 4,
    paddingHorizontal: 4,
  },
  toolBtn: {
    backgroundColor: Colors.surface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  toolLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
  },
  toolDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginHorizontal: 2,
  },
  // Keyframe strip
  stripRow: {
    maxHeight: 28,
  },
  stripContent: {
    gap: 2,
    paddingHorizontal: 4,
  },
  stripCell: {
    width: 22,
    height: 22,
    borderRadius: 3,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stripCellActive: {
    backgroundColor: Colors.primary,
  },
  stripCellKeyframe: {
    borderWidth: 1.5,
    borderColor: '#FF6B00',
    backgroundColor: '#1A1A1A',
  },
  stripText: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  stripTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // Dancer edit popup
  dancerEditPopup: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginHorizontal: 8,
    marginTop: 4,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dancerEditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dancerEditDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  dancerEditInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dancerEditRole: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  dancerEditDone: {
    padding: 2,
  },
  colorPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
  },
});
