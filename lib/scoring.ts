import type { Habit, RecordEntry } from "./types";

export function parseTimeToMinutes(value: string | null | undefined) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value?.trim() ?? "");
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutesAsTime(minutes: number) {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const remaining = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

export function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function computeHabitScore(
  habit: Pick<Habit, "id" | "name" | "target" | "unit">,
  record: RecordEntry | undefined,
) {
  if (!record || record.value <= 0) return 0;

  if (habit.unit === "boolean") {
    return record.completed ? 100 : 0;
  }

  if (habit.unit === "time") {
    const lateMinutes = record.value - habit.target;
    if (lateMinutes <= 0) return 100;

    const tolerance =
      habit.name === "早睡" || habit.name.includes("睡") ? 90 : 60;
    return clampScore(100 - (lateMinutes / tolerance) * 99);
  }

  if (habit.target <= 0) return clampScore(record.value);
  return clampScore((record.value / habit.target) * 100);
}
