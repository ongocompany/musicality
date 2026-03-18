import { useState, useCallback, useMemo } from 'react';

export type PlayerMode = 'grid-view' | 'grid-edit' | 'form-view' | 'form-edit';
export type SegmentState = 'view' | 'edit' | 'inactive';

export function usePlayerMode() {
  const [mode, setMode] = useState<PlayerMode>('grid-view');

  const isEdit = mode.endsWith('-edit');
  const isFormation = mode.startsWith('form-');
  const isGridView = mode === 'grid-view';
  const isGridEdit = mode === 'grid-edit';
  const isFormView = mode === 'form-view';
  const isFormEdit = mode === 'form-edit';

  const onGridTap = useCallback(() => setMode('grid-view'), []);
  const onGridLongPress = useCallback(() => setMode('grid-edit'), []);
  const onFormTap = useCallback(() => setMode('form-view'), []);
  const onFormLongPress = useCallback(() => setMode('form-edit'), []);

  const gridSegState: SegmentState = isGridView ? 'view' : isGridEdit ? 'edit' : 'inactive';
  const formSegState: SegmentState = isFormView ? 'view' : isFormEdit ? 'edit' : 'inactive';

  return {
    mode, setMode,
    isEdit, isFormation,
    isGridView, isGridEdit, isFormView, isFormEdit,
    gridSegState, formSegState,
    onGridTap, onGridLongPress,
    onFormTap, onFormLongPress,
  };
}
