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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Image } from 'react-native';
import { useCommunityStore } from '../../stores/communityStore';
import { usePlayerStore } from '../../stores/playerStore';
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
  { id: 'line', label: 'Line', icon: 'remove' },
  { id: 'two-lines', label: '2Lines', icon: 'reorder-two' },
  { id: 'v-shape', label: 'V', icon: 'chevron-down-outline' },
  { id: 'v-shape-inv', label: 'Λ', icon: 'chevron-up-outline' },
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
  'v-shape-inv': (n) => {
    const res: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2;
      const depth = Math.floor(i / 2);
      const maxD = Math.max(1, Math.floor((n - 1) / 2));
      const xOff = 0.15 + 0.2 * depth / maxD;
      const y = 0.7 - 0.4 * depth / maxD;
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
const PILLAR_W = 12;
const PILLAR_H = 28;
const TILT_DEG = 30;
const PERSP_PX = 800;

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
  onTogglePlay?: () => void;
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
  onTogglePlay,
}: FormationStageViewProps) {
  const [selectedDancerIds, setSelectedDancerIds] = useState<Set<string>>(new Set());
  const [dragDancerId, setDragDancerId] = useState<string | null>(null);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [editingDancerId, setEditingDancerId] = useState<string | null>(null);
  const [is3D, setIs3D] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, forceRender] = useState(0);
  // onTogglePlay prop used for fullscreen play/pause
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartNormRef = useRef<{ x: number; y: number } | null>(null);
  const dragPendingRef = useRef<{ dx: number; dy: number } | null>(null);
  const dragRafRef = useRef<number | null>(null);

  // Crew members for assignment
  const myCrewIds = useCommunityStore((s) => s.myCrewIds);
  const activeCrewMembers = useCommunityStore((s) => s.activeCrewMembers);
  const fetchCrewMembers = useCommunityStore((s) => s.fetchCrewMembers);
  const crewMembersFetched = useRef(false);

  useEffect(() => {
    if (myCrewIds.length > 0 && !crewMembersFetched.current) {
      crewMembersFetched.current = true;
      fetchCrewMembers(myCrewIds[0]);
    }
  }, [myCrewIds]);

  const screenWidth = Dimensions.get('window').width;
  const stageWidth = screenWidth - 16; // minimal horizontal padding
  const stageHeight = stageWidth * (stageConfig.gridHeight / stageConfig.gridWidth);
  const backstageHeight = stageHeight * (is3D ? BACKSTAGE_RATIO * 2 : BACKSTAGE_RATIO);
  const totalHeight = stageHeight + backstageHeight;

  // Flip: view from performer side — labels swap, dancer XY mirrored, stage shape unchanged
  // column-reverse moves backstage box to bottom, so dancer offset changes
  const dotTopOffset = isFlipped ? 0 : backstageHeight;
  const flipX = (x: number) => isFlipped ? 1 - x : x;
  const flipY = (y: number) => isFlipped ? 1 - y : y;
  const animFlip = (v: Animated.Value) =>
    isFlipped ? Animated.subtract(1, v) : v;

  // Current positions (from keyframe or interpolated)
  const currentPositions = useMemo(
    () => getFormationAtBeat(formationData, currentBeatIndex),
    [formationData, currentBeatIndex],
  );

  const isKeyframe = useMemo(
    () => hasKeyframeAtBeat(formationData, currentBeatIndex),
    [formationData, currentBeatIndex],
  );

  // Sort dancers by Y for correct depth order (back → front)
  const sortedPositions = useMemo(() => {
    if (!currentPositions) return null;
    return [...currentPositions].sort((a, b) => a.y - b.y);
  }, [currentPositions]);

  // ─── Animated positions for smooth playback ─────────
  const animatedPositions = useRef<Map<string, { x: Animated.Value; y: Animated.Value }>>(new Map());

  // Ensure animated values exist for all dancers (initialize to actual positions)
  useEffect(() => {
    const initialPositions = getFormationAtBeat(formationData, currentBeatIndex);
    for (const dancer of formationData.dancers) {
      if (!animatedPositions.current.has(dancer.id)) {
        const pos = initialPositions?.find((p) => p.dancerId === dancer.id);
        animatedPositions.current.set(dancer.id, {
          x: new Animated.Value(pos?.x ?? 0.5),
          y: new Animated.Value(pos?.y ?? 0.5),
        });
      }
    }
  }, [formationData.dancers]);

  // Update animated positions when beat/positions change
  useEffect(() => {
    if (!currentPositions) return;
    for (const pos of currentPositions) {
      const anim = animatedPositions.current.get(pos.dancerId);
      if (!anim) continue;
      if (isPlaying) {
        // Smooth playback: fractional beat updates every ~50ms,
        // short timing (60ms) bridges between updates for 60fps visual smoothness
        Animated.timing(anim.x, {
          toValue: pos.x,
          duration: 60,
          useNativeDriver: false,
        }).start();
        Animated.timing(anim.y, {
          toValue: pos.y,
          duration: 60,
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

  // ─── Selection rectangle (drag-select) ──────────────
  const [selectionRect, setSelectionRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const selectionStartRef = useRef<{ normX: number; normY: number } | null>(null);

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
        // Map screen coords to data coords (flip back if flipped)
        const stageY = isFlipped ? locationY : locationY - backstageHeight;
        const screenNormX = locationX / stageWidth;
        const screenNormY = stageY / stageHeight;
        const normX = isFlipped ? 1 - screenNormX : screenNormX;
        const normY = isFlipped ? 1 - screenNormY : screenNormY;

        const dancer = findClosestDancer(normX, normY);
        if (dancer) {
          setDragDancerId(dancer);
          dragStartNormRef.current = { x: normX, y: normY };
          // Start long-press timer
          longPressTimerRef.current = setTimeout(() => {
            handleLongPressDancer(dancer);
            setDragDancerId(null);
          }, 500);
        } else {
          // Empty space → start selection rectangle
          selectionStartRef.current = { normX, normY };
          setSelectionRect(null);
          setSelectedDancerIds(new Set());
          if (editingDancerId) {
            handleNameConfirm();
          }
        }
      },
      onPanResponderMove: (evt, gs) => {
        // Cancel long-press only if moved significantly (Android finger jitter tolerance)
        if (longPressTimerRef.current && (Math.abs(gs.dx) > 8 || Math.abs(gs.dy) > 8)) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        const { locationX, locationY } = evt.nativeEvent;
        const stageY = isFlipped ? locationY : locationY - backstageHeight;
        const screenNormX = Math.max(0, Math.min(1, locationX / stageWidth));
        const screenNormY = Math.max(-backstageHeight / stageHeight, Math.min(1, stageY / stageHeight));
        const normX = isFlipped ? 1 - screenNormX : screenNormX;
        const normY = isFlipped ? 1 - screenNormY : screenNormY;

        // Selection rectangle drag (empty space)
        if (selectionStartRef.current && !dragDancerId) {
          const s = selectionStartRef.current;
          // Convert back to screen coords for display
          const displayStartX = (isFlipped ? 1 - s.normX : s.normX) * stageWidth;
          const displayStartY = (isFlipped ? 1 - s.normY : s.normY) * stageHeight + (isFlipped ? 0 : backstageHeight);
          const displayEndX = locationX;
          const displayEndY = locationY;
          setSelectionRect({
            startX: Math.min(displayStartX, displayEndX),
            startY: Math.min(displayStartY, displayEndY),
            endX: Math.max(displayStartX, displayEndX),
            endY: Math.max(displayStartY, displayEndY),
          });
          return;
        }

        // Dancer drag (multi-select: move all selected dancers by delta)
        if (!dragDancerId || !currentPositions || !dragStartNormRef.current) return;
        const dx = normX - dragStartNormRef.current.x;
        const dy = normY - dragStartNormRef.current.y;
        dragStartNormRef.current = { x: normX, y: normY };

        // Accumulate delta and batch via rAF for smooth dragging
        if (dragPendingRef.current) {
          dragPendingRef.current.dx += dx;
          dragPendingRef.current.dy += dy;
        } else {
          dragPendingRef.current = { dx, dy };
        }

        if (!dragRafRef.current) {
          dragRafRef.current = requestAnimationFrame(() => {
            dragRafRef.current = null;
            const pending = dragPendingRef.current;
            if (!pending || !currentPositions) return;
            dragPendingRef.current = null;

            const movingIds = selectedDancerIds.has(dragDancerId)
              ? selectedDancerIds
              : new Set([dragDancerId]);

            const newPositions = currentPositions.map((p) => {
              if (!movingIds.has(p.dancerId)) return p;
              return {
                ...p,
                x: Math.max(0.02, Math.min(0.98, p.x + pending.dx)),
                y: Math.max(-backstageHeight / stageHeight, Math.min(0.98, p.y + pending.dy)),
              };
            });

            const keyframe: FormationKeyframe = {
              beatIndex: currentBeatIndex,
              positions: newPositions.map((p) => ({
                dancerId: p.dancerId,
                x: Math.round(p.x * 1000) / 1000,
                y: Math.round(p.y * 1000) / 1000,
              })),
            };
            onUpdate(setKeyframe(formationData, keyframe));
          });
        }
      },
      onPanResponderRelease: (evt) => {
        // Selection rectangle release → select dancers inside
        if (selectionStartRef.current && !dragDancerId && currentPositions) {
          const s = selectionStartRef.current;
          const { locationX, locationY } = evt.nativeEvent;
          const stageY = isFlipped ? locationY : locationY - backstageHeight;
          const endNormX = isFlipped ? 1 - Math.max(0, Math.min(1, locationX / stageWidth)) : Math.max(0, Math.min(1, locationX / stageWidth));
          const endNormY = isFlipped ? 1 - Math.max(0, Math.min(1, stageY / stageHeight)) : Math.max(0, Math.min(1, stageY / stageHeight));

          const minX = Math.min(s.normX, endNormX);
          const maxX = Math.max(s.normX, endNormX);
          const minY = Math.min(s.normY, endNormY);
          const maxY = Math.max(s.normY, endNormY);

          // Only select if dragged a meaningful distance
          if (maxX - minX > 0.03 || maxY - minY > 0.03) {
            const selected = new Set<string>();
            for (const pos of currentPositions) {
              if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
                selected.add(pos.dancerId);
              }
            }
            setSelectedDancerIds(selected);
          }
          setSelectionRect(null);
          selectionStartRef.current = null;
        }

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
        dragStartNormRef.current = null;
        dragPendingRef.current = null;
        if (dragRafRef.current) {
          cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
        selectionStartRef.current = null;
        setSelectionRect(null);
      },
    });
  }, [isEditing, dragDancerId, currentPositions, currentBeatIndex, formationData, stageWidth, stageHeight, backstageHeight, onUpdate, findClosestDancer, isFlipped, selectedDancerIds]);

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

  const handleAssignMember = useCallback(
    (userId: string, displayName: string) => {
      if (!editingDancerId) return;
      const dancer = formationData.dancers.find((d) => d.id === editingDancerId);
      if (!dancer) return;
      // Toggle: if same member already assigned, unassign
      const isUnassign = dancer.crewMemberId === userId;
      const updatedDancers = formationData.dancers.map((d) =>
        d.id === editingDancerId
          ? {
              ...d,
              crewMemberId: isUnassign ? undefined : userId,
              crewMemberName: isUnassign ? undefined : displayName,
            }
          : d,
      );
      onUpdate({ ...formationData, dancers: updatedDancers });
      if (!isUnassign) {
        setEditingName(displayName);
      }
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

  // Clipboard: copy current keyframe positions, paste to another beat
  const [clipboardPositions, setClipboardPositions] = useState<DancerPosition[] | null>(null);

  const handleCopyKeyframe = useCallback(() => {
    if (!currentPositions) return;
    setClipboardPositions([...currentPositions]);
  }, [currentPositions]);

  const handlePasteKeyframe = useCallback(() => {
    if (!clipboardPositions) return;
    const keyframe: FormationKeyframe = {
      beatIndex: currentBeatIndex,
      positions: clipboardPositions.map(p => ({ ...p })),
    };
    onUpdate(setKeyframe(formationData, keyframe));
    setClipboardPositions(null);
  }, [clipboardPositions, currentBeatIndex, formationData, onUpdate]);

  // ─── Add / Remove dancers ─────────────────────────
  const DANCER_COLORS = [
    '#4FC3F7', '#F48FB1', '#81C784', '#FFB74D', '#CE93D8', '#A1887F',
    '#4DD0E1', '#FF8A65', '#AED581', '#F06292', '#7986CB', '#DCE775',
    '#90CAF9', '#EF9A9A', '#A5D6A7', '#FFCC80', '#B39DDB', '#BCAAA4',
    '#80DEEA', '#FFAB91', '#C5E1A5', '#F48FB1', '#9FA8DA', '#E6EE9C',
  ];
  const MAX_DANCERS = 24;

  const handleAddDancer = useCallback(() => {
    if (formationData.dancers.length >= MAX_DANCERS) return;
    const idx = formationData.dancers.length;
    const role = idx % 2 === 0 ? 'leader' as const : 'follower' as const;
    const newDancer: DancerDef = {
      id: `D${idx + 1}`,
      label: `${role === 'leader' ? 'L' : 'F'}${Math.ceil((idx + 1) / 2)}`,
      role,
      color: DANCER_COLORS[idx % DANCER_COLORS.length],
    };
    // Place new dancer in backstage center, left-to-right order
    const backstageX = 0.05 + (idx * 0.04);
    const clampedX = Math.min(backstageX, 0.95);
    const newData: FormationData = {
      ...formationData,
      dancers: [...formationData.dancers, newDancer],
      keyframes: formationData.keyframes.map((kf) => ({
        ...kf,
        positions: [...kf.positions, { dancerId: newDancer.id, x: clampedX, y: -0.05, offstage: true }],
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

  // ─── Fullscreen beat count pulse ─────────────────────
  const fullscreenBeat = Math.round(currentBeatIndex) % 8 + 1; // 1-8
  const isAccent = fullscreenBeat === 1 || fullscreenBeat === 5;

  useEffect(() => {
    if (!isFullscreen || !isPlaying) return;
    if (isAccent) {
      pulseAnim.setValue(1.3);
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [fullscreenBeat, isFullscreen, isPlaying]);

  // ─── Fullscreen helpers ────────────────────────────
  const enterFullscreen = useCallback(async () => {
    setIsFullscreen(true);
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
  }, []);
  const exitFullscreen = useCallback(async () => {
    setIsFullscreen(false);
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    // Force re-render after orientation reverts so layout refreshes
    setTimeout(() => forceRender((n) => n + 1), 300);
  }, []);

  // Cleanup orientation on unmount
  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // ─── Fullscreen dimensions (landscape) ─────────────
  const screenW = Dimensions.get('screen').width;
  const screenH = Dimensions.get('screen').height;
  const fsLandW = Math.max(screenW, screenH);
  const fsLandH = Math.min(screenW, screenH);
  const fsStageW = fsLandW - 16;
  const fsMaxStageH = fsLandH * 0.88;
  const fsStageH = Math.min(fsStageW * (stageConfig.gridHeight / stageConfig.gridWidth), fsMaxStageH);
  const fsBackstageH = fsStageH * BACKSTAGE_RATIO * (is3D ? 2 : 1);
  const fsTotalH = fsStageH + fsBackstageH;

  // ─── Render ─────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Fullscreen Modal */}
      <Modal
        visible={isFullscreen}
        animationType="fade"
        statusBarTranslucent
        supportedOrientations={['landscape']}
        onRequestClose={exitFullscreen}
      >
        <Pressable style={styles.fullscreenContainer} onPress={onTogglePlay}>
          {/* Beat count watermark */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 5, alignItems: 'center', justifyContent: 'center' }]}>
            <Animated.Text
              style={[
                styles.fullscreenBeatWatermark,
                {
                  transform: [{ scale: pulseAnim }],
                  opacity: isAccent ? 0.3 : 0.15,
                },
              ]}
            >
              {fullscreenBeat}
            </Animated.Text>
          </View>

          {/* Play/Pause indicator — top left */}
          <View style={styles.fullscreenPlayIndicator} pointerEvents="none">
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={20}
              color="rgba(255,255,255,0.4)"
            />
          </View>

          {/* Stage */}
          <View
            style={[styles.stageOuter, {
              width: fsStageW,
              height: fsTotalH,
              flexDirection: isFlipped ? 'column-reverse' : 'column',
              marginTop: is3D ? -fsBackstageH * 0.5 : 0,
              ...(is3D ? {
                transformOrigin: '50% 100%',
                transform: [{ perspective: PERSP_PX }, { rotateX: `${TILT_DEG}deg` }],
              } : {}),
            }]}
          >
            <View style={[styles.backstage, { height: fsBackstageH }]} pointerEvents="none">
              <Text style={styles.backstageLabel}>BACKSTAGE</Text>
            </View>
            <View style={[styles.stage, { width: fsStageW, height: fsStageH }]} pointerEvents="none">
              {gridLines.hLines.map((p, i) => (
                <View key={`fh-${i}`} style={[styles.gridLine, { top: `${p * 100}%`, width: '100%', backgroundColor: 'rgba(255,255,255,0.06)' }]} />
              ))}
              {gridLines.vLines.map((p, i) => (
                <View key={`fv-${i}`} style={[styles.gridLineV, { left: `${p * 100}%`, height: '100%', backgroundColor: 'rgba(255,255,255,0.06)' }]} />
              ))}
              <View style={[styles.audienceLine, { bottom: 0, width: '100%' }]} />
            </View>

            {/* Dancers — scaled up for fullscreen */}
            {(() => {
              const FS = 2; // fullscreen scale factor
              const fsDot = DOT_RADIUS * FS;
              const fsPW = PILLAR_W * FS;
              const fsPH = PILLAR_H * FS;
              return sortedPositions?.map((pos) => {
                const dancer = formationData.dancers.find((d) => d.id === pos.dancerId);
                if (!dancer) return null;
                const anim = animatedPositions.current.get(pos.dancerId);
                const isOffstage = pos.y < 0;
                const dotLeft = anim
                  ? Animated.multiply(animFlip(anim.x), fsStageW)
                  : flipX(pos.x) * fsStageW;
                const fsDotTopOffset = isFlipped ? 0 : fsBackstageH;
                const dotTop = anim
                  ? Animated.add(Animated.multiply(animFlip(anim.y), fsStageH), fsDotTopOffset)
                  : flipY(pos.y) * fsStageH + fsDotTopOffset;
                const displayName = dancer.crewMemberName || dancer.label;

                if (is3D) {
                  return (
                    <View key={pos.dancerId} pointerEvents="none" style={StyleSheet.absoluteFill}>
                      <Animated.View style={{
                        position: 'absolute',
                        left: Animated.subtract(dotLeft, fsPW * 0.7),
                        top: Animated.add(dotTop, 2),
                        width: fsPW * 1.4, height: 6,
                        borderRadius: fsPW * 0.7,
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        opacity: isOffstage ? 0.2 : 0.35,
                      }} />
                      <Animated.View style={{
                        position: 'absolute',
                        left: Animated.subtract(dotLeft, fsPW / 2),
                        top: Animated.subtract(dotTop, fsPH),
                        width: fsPW, height: fsPH,
                        borderRadius: fsPW / 2,
                        backgroundColor: dancer.color,
                        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
                        opacity: isOffstage ? 0.4 : 1,
                      }} />
                      <Animated.View style={{
                        position: 'absolute',
                        left: Animated.subtract(dotLeft, fsPW * 0.45),
                        top: Animated.subtract(dotTop, fsPH - 2),
                        width: fsPW * 0.9, height: fsPW * 0.9,
                        borderRadius: fsPW * 0.45,
                        backgroundColor: dancer.color,
                        opacity: isOffstage ? 0.5 : 1,
                      }} />
                      <Animated.Text
                        style={{
                          position: 'absolute',
                          left: Animated.subtract(dotLeft, 36),
                          top: Animated.add(dotTop, 6),
                          width: 72, fontSize: 11, color: Colors.textSecondary, textAlign: 'center',
                        }}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Animated.Text>
                    </View>
                  );
                }
                return (
                  <View key={pos.dancerId} pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <Animated.View
                      style={{
                        position: 'absolute',
                        left: Animated.subtract(dotLeft, fsDot),
                        top: Animated.subtract(dotTop, fsDot),
                        width: fsDot * 2, height: fsDot * 2,
                        borderRadius: fsDot,
                        backgroundColor: dancer.color,
                        borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
                        opacity: isOffstage ? 0.4 : 1,
                      }}
                    />
                    <Animated.Text
                      style={{
                        position: 'absolute',
                        left: Animated.subtract(dotLeft, 36),
                        top: Animated.add(dotTop, fsDot + 3),
                        width: 72, fontSize: 11, color: Colors.textSecondary, textAlign: 'center',
                      }}
                      numberOfLines={1}
                    >
                      {displayName}
                    </Animated.Text>
                  </View>
                );
              });
            })()}
          </View>

          {/* Close button — top right, above tap overlay */}
          <Pressable
            style={[styles.fullscreenCloseBtn, { zIndex: 20 }]}
            onPress={exitFullscreen}
            hitSlop={16}
          >
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Stage config row */}
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Stage</Text>
        <Pressable
          style={styles.viewToggleBtn}
          onPress={() => setIs3D(!is3D)}
          hitSlop={6}
        >
          <Text style={styles.viewToggleText}>{is3D ? '3D' : '2D'}</Text>
        </Pressable>
        <Pressable
          style={styles.viewToggleBtn}
          onPress={() => setIsFlipped(!isFlipped)}
          hitSlop={6}
        >
          <Ionicons name="swap-vertical" size={14} color={isFlipped ? Colors.primary : Colors.textSecondary} />
        </Pressable>
        <Pressable
          style={styles.sizeBtn}
          onPress={() => setShowSizeMenu(!showSizeMenu)}
        >
          <Text style={styles.sizeBtnText}>
            {stageConfig.gridWidth}×{stageConfig.gridHeight}
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
              <Ionicons name="add-circle-outline" size={18} color={formationData.dancers.length >= MAX_DANCERS ? Colors.textMuted : Colors.textSecondary} />
            </Pressable>
            <Text style={styles.beatIndicator}>
              Beat {Math.round(currentBeatIndex) + 1}
              <Text style={{ color: isKeyframe ? Colors.accent : Colors.textMuted }}>
                {isKeyframe ? ' ●' : ' ○'}
              </Text>
            </Text>
          </View>
        )}
        {!isEditing && (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
            <Text style={styles.playbackHint}>
              {isPlaying ? '▶ Playing' : '⏸ Paused'}
            </Text>
            <Pressable onPress={enterFullscreen} hitSlop={8}>
              <Ionicons name="expand-outline" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>
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

      {/* Stage area — optional 3D perspective tilt */}
      <View
        style={[styles.stageOuter, {
          width: stageWidth,
          height: totalHeight,
          flexDirection: isFlipped ? 'column-reverse' : 'column',
          ...(is3D ? {
            transformOrigin: '50% 100%',
            transform: [{ perspective: PERSP_PX }, { rotateX: `${TILT_DEG}deg` }],
          } : {}),
        }]}
        {...panResponder.panHandlers}
      >
        {/* Backstage */}
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

          {/* Audience indicator */}
          <View
            style={[styles.audienceLine, { top: isFlipped ? 0 : stageHeight - 2, width: stageWidth }]}
            pointerEvents="none"
          />
          <Text
            style={[styles.audienceLabel, { top: isFlipped ? 2 : stageHeight - 14 }]}
            pointerEvents="none"
          >
            {isFlipped ? '▲ AUDIENCE' : 'AUDIENCE ▼'}
          </Text>

        </View>

        {/* Dancers — sorted back-to-front for depth */}
        {(sortedPositions ?? []).map((pos) => {
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
            const dotLeft = Animated.multiply(animFlip(anim.x), stageWidth);
            const dotTop = Animated.add(
              Animated.multiply(animFlip(anim.y), stageHeight),
              dotTopOffset,
            );

            if (!is3D) {
              // ── 2D top-view: circle dot ──
              return (
                <View key={dancer.id} pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Animated.Text
                    style={[styles.dancerName, {
                      left: Animated.subtract(dotLeft, 24),
                      top: Animated.subtract(dotTop, DOT_RADIUS + 12),
                    }]}
                    numberOfLines={1}
                  >{shortName}</Animated.Text>
                  <Animated.View
                    style={[styles.dancerDot, {
                      left: Animated.subtract(dotLeft, DOT_RADIUS),
                      top: Animated.subtract(dotTop, DOT_RADIUS),
                      backgroundColor: dancer.color,
                    }]}
                  />
                </View>
              );
            }

            // ── 3D pillar ──
            return (
              <View key={dancer.id} pointerEvents="none" style={StyleSheet.absoluteFill}>
                <Animated.Text
                  style={[styles.dancerName, {
                    left: Animated.subtract(dotLeft, 24),
                    top: Animated.subtract(dotTop, PILLAR_H + 12),
                  }]}
                  numberOfLines={1}
                >{shortName}</Animated.Text>
                <Animated.View style={[styles.pillarShadow, {
                  left: Animated.subtract(dotLeft, PILLAR_W * 0.6),
                  top: Animated.subtract(dotTop, 2),
                }]} />
                <Animated.View style={[styles.dancerPillar, {
                  left: Animated.subtract(dotLeft, PILLAR_W / 2),
                  top: Animated.subtract(dotTop, PILLAR_H),
                  backgroundColor: dancer.color,
                }]}>
                  <View style={styles.pillarHighlight} />
                  <View style={styles.pillarShade} />
                </Animated.View>
                <Animated.View style={[styles.pillarHead, {
                  left: Animated.subtract(dotLeft, PILLAR_W * 0.45),
                  top: Animated.subtract(dotTop, PILLAR_H + 2),
                  backgroundColor: dancer.color,
                }]} />
              </View>
            );
          }

          // Static positioning (editing or paused)
          const pixelLeft = flipX(pos.x) * stageWidth;
          const pixelTop = flipY(pos.y) * stageHeight + dotTopOffset;

          if (!is3D) {
            // ── 2D top-view: circle dot ──
            return (
              <View key={dancer.id} pointerEvents="none" style={StyleSheet.absoluteFill}>
                <Text
                  style={[styles.dancerName, {
                    left: pixelLeft - 24,
                    top: pixelTop - DOT_RADIUS - 12,
                    opacity: isOffstage ? 0.5 : 1,
                  }]}
                  numberOfLines={1}
                >{shortName}</Text>
                <View
                  style={[styles.dancerDot, {
                    left: pixelLeft - DOT_RADIUS,
                    top: pixelTop - DOT_RADIUS,
                    backgroundColor: dancer.color,
                    opacity: isOffstage ? 0.5 : 1,
                    borderColor: isSelected ? '#FFFFFF' : isDragging ? '#FFD700' : 'transparent',
                    transform: [{ scale: isDragging ? 1.5 : 1 }],
                  }]}
                />
              </View>
            );
          }

          // ── 3D pillar ──
          return (
            <View key={dancer.id} pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Text
                style={[styles.dancerName, {
                  left: pixelLeft - 24,
                  top: pixelTop - PILLAR_H - 14,
                  opacity: isOffstage ? 0.5 : 1,
                }]}
                numberOfLines={1}
              >{shortName}</Text>
              <View style={[styles.pillarShadow, {
                left: pixelLeft - PILLAR_W * 0.7,
                top: pixelTop - 3,
                opacity: isOffstage ? 0.2 : 0.4,
              }]} />
              <View
                style={[styles.dancerPillar, {
                  left: pixelLeft - PILLAR_W / 2,
                  top: pixelTop - PILLAR_H,
                  backgroundColor: dancer.color,
                  opacity: isOffstage ? 0.5 : 1,
                  borderColor: isSelected ? '#FFFFFF' : isDragging ? '#FFD700' : 'transparent',
                  transform: [{ scale: isDragging ? 1.3 : 1 }],
                }]}
              >
                <View style={styles.pillarHighlight} />
                <View style={styles.pillarShade} />
              </View>
              <View
                style={[styles.pillarHead, {
                  left: pixelLeft - PILLAR_W * 0.45,
                  top: pixelTop - PILLAR_H - 2,
                  backgroundColor: dancer.color,
                  opacity: isOffstage ? 0.5 : 1,
                  borderColor: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.25)',
                }]}
              />
            </View>
          );
        })}

        {/* Selection rectangle (drag-select) */}
        {selectionRect && (
          <View
            style={{
              position: 'absolute',
              left: selectionRect.startX,
              top: selectionRect.startY,
              width: selectionRect.endX - selectionRect.startX,
              height: selectionRect.endY - selectionRect.startY,
              borderWidth: 1.5,
              borderColor: 'rgba(187,134,252,0.8)',
              borderStyle: 'dashed',
              backgroundColor: 'rgba(187,134,252,0.1)',
              zIndex: 20,
            }}
            pointerEvents="none"
          />
        )}
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
          {/* Crew member assignment */}
          {activeCrewMembers.length > 0 && (
            <>
              <Pressable
                style={styles.assignMemberToggle}
                onPress={() => setShowMemberPicker(!showMemberPicker)}
              >
                <Ionicons name="people" size={14} color={Colors.textSecondary} />
                <Text style={styles.assignMemberToggleText}>
                  {editingDancer.crewMemberId
                    ? `✓ ${editingDancer.crewMemberName}`
                    : 'Assign Member'}
                </Text>
                <Ionicons
                  name={showMemberPicker ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={Colors.textMuted}
                />
              </Pressable>
              {showMemberPicker && (
                <ScrollView style={styles.memberList} nestedScrollEnabled>
                  <View style={styles.memberGrid}>
                    {activeCrewMembers.map((member) => {
                      const isAssigned = editingDancer.crewMemberId === member.userId;
                      const assignedToOther = !isAssigned && formationData.dancers.some(
                        (d) => d.id !== editingDancerId && d.crewMemberId === member.userId,
                      );
                      const name = member.profile?.displayName || member.profile?.nickname || 'Dancer';
                      return (
                        <Pressable
                          key={member.id}
                          style={[
                            styles.memberItem,
                            isAssigned && styles.memberItemActive,
                            assignedToOther && { opacity: 0.4 },
                          ]}
                          onPress={() => !assignedToOther && handleAssignMember(member.userId, name)}
                          disabled={assignedToOther}
                        >
                          {member.profile?.avatarUrl ? (
                            <Image
                              source={{ uri: member.profile.avatarUrl }}
                              style={styles.memberAvatar}
                            />
                          ) : (
                            <View style={[styles.memberAvatar, { backgroundColor: Colors.surface }]}>
                              <Ionicons name="person" size={12} color={Colors.textMuted} />
                            </View>
                          )}
                          <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
                          {isAssigned && (
                            <Ionicons name="checkmark-circle" size={14} color={Colors.accent} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </>
          )}
        </View>
      )}

      {/* Editing controls — reserve space even when not editing */}
      {isEditing ? (
        <View style={styles.editControls}>
          {/* Beat navigation — removed (use grid cells or playback controls) */}

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
            <Pressable style={styles.toolBtn} onPress={clipboardPositions ? handlePasteKeyframe : handleCopyKeyframe}>
              <Ionicons name={clipboardPositions ? 'clipboard-outline' : 'copy-outline'} size={14} color={clipboardPositions ? Colors.accent : Colors.text} />
              <Text style={[styles.toolLabel, clipboardPositions && { color: Colors.accent }]}>{clipboardPositions ? 'Paste' : 'Copy'}</Text>
            </Pressable>
            {isKeyframe && (
              <Pressable style={styles.toolBtn} onPress={handleDeleteKeyframe}>
                <Ionicons name="trash-outline" size={14} color={Colors.error} />
                <Text style={[styles.toolLabel, { color: Colors.error }]}>Del</Text>
              </Pressable>
            )}
          </ScrollView>

        </View>
      ) : (
        <View style={{ height: 40 }} />
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
  viewToggleBtn: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  viewToggleText: {
    fontSize: FontSize.xs,
    color: Colors.accent,
    fontWeight: '700',
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
  // Dancers — 2D dots
  dancerDot: {
    position: 'absolute',
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  // Dancers — 3D pillars
  dancerPillar: {
    position: 'absolute',
    width: PILLAR_W,
    height: PILLAR_H,
    borderRadius: PILLAR_W / 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    overflow: 'hidden',
  },
  pillarHighlight: {
    position: 'absolute',
    left: 1,
    top: 2,
    width: 3,
    height: PILLAR_H - 4,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  pillarShade: {
    position: 'absolute',
    right: 1,
    top: 2,
    width: 3,
    height: PILLAR_H - 4,
    borderRadius: 1.5,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  pillarHead: {
    position: 'absolute',
    width: PILLAR_W * 0.9,
    height: PILLAR_W * 0.9,
    borderRadius: PILLAR_W * 0.45,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  pillarShadow: {
    position: 'absolute',
    width: PILLAR_W * 1.4,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    height: 32,
    marginTop: 6,
    marginBottom: 4,
  },
  toolRowContent: {
    gap: 4,
    paddingHorizontal: 4,
    justifyContent: 'center',
    flexGrow: 1,
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
  // Dancer edit popup
  dancerEditPopup: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginHorizontal: 8,
    marginTop: 4,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 50,
    elevation: 50,
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
  // Crew member assignment
  assignMemberToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 6,
  },
  assignMemberToggleText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  memberList: {
    maxHeight: 120,
  },
  memberGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 6,
    paddingBottom: 6,
    gap: 4,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
    width: '48%' as any,
  },
  memberItemActive: {
    backgroundColor: 'rgba(100, 200, 100, 0.2)',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  memberAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  memberName: {
    flex: 1,
    fontSize: 11,
    color: Colors.text,
  },
  // Fullscreen mode
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 16,
  },
  fullscreenBeatWatermark: {
    position: 'absolute',
    fontSize: 120,
    fontWeight: '900',
    color: '#FFFFFF',
    zIndex: 0,
  },
  fullscreenPlayIndicator: {
    position: 'absolute',
    top: 20,
    left: 48,
    zIndex: 10,
  },
  fullscreenCloseBtn: {
    position: 'absolute',
    top: 20,
    right: 48,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
});
