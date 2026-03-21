import { useState, useCallback } from 'react';

export type PlayerMode = 'grid-edit' | 'form-edit';
export type SegmentState = 'inactive' | 'view' | 'edit';

export function usePlayerMode() {
  const [mode, setMode] = useState<PlayerMode>('grid-edit');

  const isFormation = mode === 'form-edit';
  const isGrid = mode === 'grid-edit';

  const onGridPress = useCallback(() => setMode('grid-edit'), []);
  const onFormPress = useCallback(() => setMode('form-edit'), []);

  // ModeSegment용 상태 — 현재 선택된 모드는 'edit', 나머지는 'inactive'
  const gridSegState: SegmentState = isGrid ? 'edit' : 'inactive';
  const formSegState: SegmentState = isFormation ? 'edit' : 'inactive';

  // ModeSegment용 핸들러 — tap과 longPress 모두 모드 전환
  const onGridTap = onGridPress;
  const onGridLongPress = onGridPress;
  const onFormTap = onFormPress;
  const onFormLongPress = onFormPress;

  return {
    mode, setMode,
    isGrid, isFormation,
    onGridPress, onFormPress,
    // ModeSegment 호환
    gridSegState, formSegState,
    onGridTap, onGridLongPress,
    onFormTap, onFormLongPress,
  };
}
