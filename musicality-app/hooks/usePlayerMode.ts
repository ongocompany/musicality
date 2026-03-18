import { useState, useCallback } from 'react';

export type PlayerMode = 'grid-edit' | 'form-edit';

export function usePlayerMode() {
  const [mode, setMode] = useState<PlayerMode>('grid-edit');

  const isFormation = mode === 'form-edit';
  const isGrid = mode === 'grid-edit';

  const onGridPress = useCallback(() => setMode('grid-edit'), []);
  const onFormPress = useCallback(() => setMode('form-edit'), []);

  return {
    mode, setMode,
    isGrid, isFormation,
    onGridPress, onFormPress,
  };
}
