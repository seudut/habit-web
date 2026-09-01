export const DEFAULT_HABIT_TIME_ZONE = "Asia/Shanghai";

export function getHabitTimeZone() {
  // 使用显式业务时区，避免容器默认 UTC 导致“今天”与用户本地日期不一致。
  const configured = process.env.HABIT_TIME_ZONE?.trim();
  if (configured) return configured;

  const system = process.env.TZ?.trim();
  return system || DEFAULT_HABIT_TIME_ZONE;
}

function formatDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

export function getHabitToday() {
  return formatDateKey(new Date(), getHabitTimeZone());
}
