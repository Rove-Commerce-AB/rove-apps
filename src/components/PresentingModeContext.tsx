"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "rove.presenting.session";

export type PresentingPrefs = {
  active: boolean;
  showEstimates: boolean;
  showReportedTime: boolean;
};

type PresentingSuggested = {
  showEstimates: boolean;
  showReportedTime: boolean;
};

type PresentingModeContextValue = PresentingPrefs & {
  suggested: PresentingSuggested;
  setSuggestedDefaults: (next: PresentingSuggested | null) => void;
  setShowEstimates: (value: boolean) => void;
  setShowReportedTime: (value: boolean) => void;
  startPresenting: (prefs?: {
    showEstimates?: boolean;
    showReportedTime?: boolean;
  }) => void;
  stopPresenting: () => void;
};

const DEFAULT_PREFS: PresentingPrefs = {
  active: false,
  showEstimates: false,
  showReportedTime: false,
};

const DEFAULT_SUGGESTED: PresentingSuggested = {
  showEstimates: false,
  showReportedTime: false,
};

const PresentingModeContext = createContext<PresentingModeContextValue>({
  ...DEFAULT_PREFS,
  suggested: DEFAULT_SUGGESTED,
  setSuggestedDefaults: () => {},
  setShowEstimates: () => {},
  setShowReportedTime: () => {},
  startPresenting: () => {},
  stopPresenting: () => {},
});

function readStored(): PresentingPrefs {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<PresentingPrefs>;
    return {
      active: parsed.active === true,
      showEstimates: parsed.showEstimates === true,
      showReportedTime: parsed.showReportedTime === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writeStored(prefs: PresentingPrefs) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function PresentingModeProvider({
  children,
  isStaff = false,
}: {
  children: ReactNode;
  /** Presenting is a staff-only chrome feature. */
  isStaff?: boolean;
}) {
  const [prefs, setPrefs] = useState<PresentingPrefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);
  const [suggested, setSuggested] = useState<PresentingSuggested>(DEFAULT_SUGGESTED);

  useEffect(() => {
    if (!isStaff) {
      setPrefs(DEFAULT_PREFS);
      setHydrated(true);
      return;
    }
    setPrefs(readStored());
    setHydrated(true);
  }, [isStaff]);

  useEffect(() => {
    if (!hydrated || !isStaff) return;
    writeStored(prefs);
  }, [prefs, hydrated, isStaff]);

  const setSuggestedDefaults = useCallback((next: PresentingSuggested | null) => {
    setSuggested(next ?? DEFAULT_SUGGESTED);
  }, []);

  const setShowEstimates = useCallback((value: boolean) => {
    if (!isStaff) return;
    setPrefs((current) => ({ ...current, showEstimates: value }));
  }, [isStaff]);

  const setShowReportedTime = useCallback((value: boolean) => {
    if (!isStaff) return;
    setPrefs((current) => ({ ...current, showReportedTime: value }));
  }, [isStaff]);

  const startPresenting = useCallback(
    (next?: { showEstimates?: boolean; showReportedTime?: boolean }) => {
      if (!isStaff) return;
      setPrefs((current) => ({
        active: true,
        showEstimates: next?.showEstimates ?? current.showEstimates,
        showReportedTime: next?.showReportedTime ?? current.showReportedTime,
      }));
    },
    [isStaff]
  );

  const stopPresenting = useCallback(() => {
    setPrefs((current) => ({ ...current, active: false }));
  }, []);

  const effectivePrefs = isStaff ? prefs : DEFAULT_PREFS;

  const value = useMemo(
    () => ({
      ...effectivePrefs,
      suggested,
      setSuggestedDefaults,
      setShowEstimates,
      setShowReportedTime,
      startPresenting,
      stopPresenting,
    }),
    [
      effectivePrefs,
      suggested,
      setSuggestedDefaults,
      setShowEstimates,
      setShowReportedTime,
      startPresenting,
      stopPresenting,
    ]
  );

  return (
    <PresentingModeContext.Provider value={value}>
      {children}
    </PresentingModeContext.Provider>
  );
}

export function usePresentingMode(): PresentingModeContextValue {
  return useContext(PresentingModeContext);
}

/** Apply presenting visibility overrides onto a Work board view. */
export function withPresentingVisibility<
  T extends { showEstimates: boolean; showReportedTime: boolean },
>(board: T, presenting: Pick<PresentingPrefs, "active" | "showEstimates" | "showReportedTime">): T {
  if (!presenting.active) return board;
  return {
    ...board,
    showEstimates: presenting.showEstimates,
    showReportedTime: presenting.showReportedTime,
  };
}
