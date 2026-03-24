import { useRef, useCallback } from "react";

export function useAutoSave(saveFn: (data: Record<string, unknown>) => Promise<void>, delayMs = 800) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown> | null>(null);

  const save = useCallback((data: Record<string, unknown>) => {
    pendingRef.current = data;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (pendingRef.current) {
        await saveFn(pendingRef.current);
        pendingRef.current = null;
      }
    }, delayMs);
  }, [saveFn, delayMs]);

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pendingRef.current) {
      await saveFn(pendingRef.current);
      pendingRef.current = null;
    }
  }, [saveFn]);

  return { save, flush };
}
