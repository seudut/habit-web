"use client";

import { useEffect, useRef, useState } from "react";
export type SaveRegistry = Map<string, () => Promise<boolean>>;
export type SaveStatus = "saved" | "pending" | "saving" | "error";
export const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: "已保存",
  pending: "等待保存",
  saving: "保存中…",
  error: "保存失败"
};

// Serialize writes and keep newer edits queued while a request is in flight.
export function useWeeklyAutosave<T>(initial: T, key: string, registry: SaveRegistry, save: (value: T) => Promise<void>, validate: (value: unknown) => value is T) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const current = useRef(initial);
  const saved = useRef(JSON.stringify(initial));
  const saveRef = useRef(save);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  saveRef.current = save;
  const flush = async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) return inFlight.current;
    const work = async () => {
      while (JSON.stringify(current.current) !== saved.current) {
        const snapshot = current.current;
        const serialized = JSON.stringify(snapshot);
        if (mounted.current) setStatus("saving");
        try {
          await saveRef.current(snapshot);
          saved.current = serialized;
          if (JSON.stringify(current.current) === serialized) {
            try {
              localStorage.removeItem(key);
            } catch {/* Server remains authoritative. */}
          }
        } catch {
          if (mounted.current) setStatus("error");
          return false;
        }
      }
      if (mounted.current) setStatus("saved");
      return true;
    };
    // Defer work so inFlight is assigned even when there is nothing to write.
    inFlight.current = Promise.resolve().then(work).finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  };
  flushRef.current = flush;
  function change(next: T) {
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    current.current = next;
    setValue(next);
    setStatus("pending");
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {/* Saving still works without local storage. */}
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flushRef.current();
    }, 600);
  }
  function reset(next: T) {
    current.current = next;
    saved.current = JSON.stringify(next);
    setValue(next);
    setStatus("saved");
    try {
      localStorage.removeItem(key);
    } catch {/* Browser drafts are optional. */}
  }
  useEffect(() => {
    mounted.current = true;
    registry.set(key, () => flushRef.current());
    try {
      const draft = localStorage.getItem(key);
      if (draft) {
        const parsed: unknown = JSON.parse(draft);
        if (validate(parsed) && JSON.stringify(parsed) !== saved.current) change(parsed);
      }
    } catch {/* Ignore unreadable browser drafts. */}
    const onUnload = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(current.current) !== saved.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      mounted.current = false;
      registry.delete(key);
      if (timer.current) clearTimeout(timer.current);
      void flushRef.current();
      window.removeEventListener("beforeunload", onUnload);
    };
    // The workspace is remounted for each week; these are stable identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, registry]);
  return {
    value,
    change,
    reset,
    flush,
    status,
    current
  };
}
