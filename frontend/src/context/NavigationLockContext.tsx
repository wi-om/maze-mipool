import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type NavigationLockContextType = {
  locked: boolean;
  lockReason: string | null;
  setNavigationLocked: (locked: boolean, reason?: string | null) => void;
};

const NavigationLockContext = createContext<NavigationLockContextType | undefined>(undefined);

export function NavigationLockProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [lockReason, setLockReason] = useState<string | null>(null);

  const setNavigationLocked = useCallback((next: boolean, reason: string | null = null) => {
    setLocked(next);
    setLockReason(next ? reason : null);
  }, []);

  useEffect(() => {
    if (!locked) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [locked]);

  const value = useMemo(
    () => ({ locked, lockReason, setNavigationLocked }),
    [locked, lockReason, setNavigationLocked],
  );

  return (
    <NavigationLockContext.Provider value={value}>{children}</NavigationLockContext.Provider>
  );
}

export function useNavigationLock() {
  const ctx = useContext(NavigationLockContext);
  if (!ctx) {
    throw new Error("useNavigationLock must be used within NavigationLockProvider");
  }
  return ctx;
}

/** Safe optional hook for components that may render outside the provider. */
export function useNavigationLockOptional() {
  return useContext(NavigationLockContext);
}
