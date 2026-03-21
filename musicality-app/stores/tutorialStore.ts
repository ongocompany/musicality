import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Tutorial Step Definitions ──────────────────────────
export type TutorialStepId =
  | 'welcome'          // Library: 데모곡을 탭하세요
  | 'analysis'         // Player: 분석 결과 소개
  | 'play'             // Player: 재생 버튼 탭
  | 'grid-edit'        // Player: 그리드 셀 길게 누르기
  | 'formation'        // Player: 포메이션 모드 전환
  | 'speed'            // Player: 속도 조절
  | 'community';       // Community/Messages 탭 소개

export type TutorialScreen = 'library' | 'player' | 'community';

/** Measured rectangle from onLayout + measureInWindow */
export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TutorialStep {
  id: TutorialStepId;
  screen: TutorialScreen;
  /** i18n key for title */
  titleKey: string;
  /** i18n key for description */
  descKey: string;
  /** Key into elementRects – measured at runtime via onLayout */
  targetElement?: string;
  /** Arrow direction from tooltip to target */
  arrowDirection?: 'up' | 'down' | 'left' | 'right';
  /** Whether this step auto-advances when user performs the action */
  autoAdvance?: boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    screen: 'library',
    titleKey: 'tutorial.welcomeTitle',
    descKey: 'tutorial.welcomeDesc',
    targetElement: 'demoTrackItem',
    arrowDirection: 'up',
    autoAdvance: true,
  },
  {
    id: 'analysis',
    screen: 'player',
    titleKey: 'tutorial.analysisTitle',
    descKey: 'tutorial.analysisDesc',
    targetElement: 'phraseGrid',
    arrowDirection: 'up',
  },
  {
    id: 'play',
    screen: 'player',
    titleKey: 'tutorial.playTitle',
    descKey: 'tutorial.playDesc',
    targetElement: 'playButton',
    arrowDirection: 'down',
    autoAdvance: true,
  },
  {
    id: 'grid-edit',
    screen: 'player',
    titleKey: 'tutorial.gridEditTitle',
    descKey: 'tutorial.gridEditDesc',
    targetElement: 'phraseGrid',
    arrowDirection: 'up',
  },
  {
    id: 'formation',
    screen: 'player',
    titleKey: 'tutorial.formationTitle',
    descKey: 'tutorial.formationDesc',
    targetElement: 'formationToggle',
    arrowDirection: 'up',
  },
  {
    id: 'speed',
    screen: 'player',
    titleKey: 'tutorial.speedTitle',
    descKey: 'tutorial.speedDesc',
    targetElement: 'speedTrigger',
    arrowDirection: 'down',
  },
  {
    id: 'community',
    screen: 'community',
    titleKey: 'tutorial.communityTitle',
    descKey: 'tutorial.communityDesc',
  },
];

// ─── Store ──────────────────────────────────────────────

interface TutorialState {
  /** Is tutorial active? */
  isActive: boolean;
  /** Current step index (0-based) */
  currentStepIndex: number;
  /** Has the user completed the tutorial at least once? */
  hasCompleted: boolean;
  /** Measured element rectangles (absolute screen coordinates) */
  elementRects: Record<string, ElementRect>;

  // Actions
  startTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  resetTutorial: () => void;
  /** Register a measured element rect (called from onLayout) */
  setElementRect: (key: string, rect: ElementRect) => void;

  // Computed helpers
  getCurrentStep: () => TutorialStep | null;
  getTotalSteps: () => number;
}

export const useTutorialStore = create<TutorialState>()(
  persist(
    (set, get) => ({
      isActive: false,
      currentStepIndex: 0,
      hasCompleted: false,
      elementRects: {},

      startTutorial: () => set({
        isActive: true,
        currentStepIndex: 0,
      }),

      nextStep: () => {
        const { currentStepIndex } = get();
        const nextIndex = currentStepIndex + 1;
        if (nextIndex >= TUTORIAL_STEPS.length) {
          get().completeTutorial();
        } else {
          set({ currentStepIndex: nextIndex });
        }
      },

      prevStep: () => {
        const { currentStepIndex } = get();
        if (currentStepIndex > 0) {
          set({ currentStepIndex: currentStepIndex - 1 });
        }
      },

      skipTutorial: () => set({
        isActive: false,
        hasCompleted: true,
      }),

      completeTutorial: () => set({
        isActive: false,
        hasCompleted: true,
        currentStepIndex: 0,
      }),

      resetTutorial: () => set({
        isActive: false,
        currentStepIndex: 0,
        hasCompleted: false,
      }),

      setElementRect: (key, rect) => set((state) => ({
        elementRects: { ...state.elementRects, [key]: rect },
      })),

      getCurrentStep: () => {
        const { isActive, currentStepIndex } = get();
        if (!isActive) return null;
        return TUTORIAL_STEPS[currentStepIndex] ?? null;
      },

      getTotalSteps: () => TUTORIAL_STEPS.length,
    }),
    {
      name: 'ritmo-tutorial',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        hasCompleted: state.hasCompleted,
      }),
    },
  ),
);
