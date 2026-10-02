import type { WeeklyPreferences } from "./weekly-types";
import { defaultWeeklyHabits } from "./weekly-utils";
export function readLegacyWeeklyPreferences(week: string): Partial<WeeklyPreferences> {
  const patch: Partial<WeeklyPreferences> = {};
  try {
    const review = localStorage.getItem(`weekly-review-${week}`);
    if (review !== null) patch.review = review;
    const raw = localStorage.getItem(`weekly-daily-habits-${week}`);
    const importedWeek = localStorage.getItem("weekly-legacy-checks-imported-week");
    const checksRaw = localStorage.getItem(`weekly-daily-habit-checks-${week}`) ?? (!importedWeek || importedWeek === week ? localStorage.getItem("weekly-daily-habit-checks") : null);
    const checks = checksRaw ? JSON.parse(checksRaw) as Record<string, unknown> : {};
    let habits: Array<{
      name: string;
      count: number;
      minutes: number;
    }> = raw ? JSON.parse(raw) : defaultWeeklyHabits();
    if (!Array.isArray(habits)) return patch;
    const legacyNames = ["金刚功", "敲胆经", "靠墙蹲", "金刚跪", "禁抖音", "禁水果", "艾灸膝盖", "行禅"];
    if (habits.length === 8 && habits.every((habit, index) => habit.name === legacyNames[index])) habits = habits.slice(0, 2);
    if (raw || checksRaw) {
      const names = new Set<string>();
      patch.habits = habits.filter(habit => typeof habit?.name === "string" && habit.name.trim()).filter(habit => {
        const name = habit.name.trim();
        if (names.has(name)) return false;
        names.add(name);
        return true;
      }).map((habit, index) => {
        const oldDefaults = localStorage.getItem(`weekly-daily-habits-version-${week}`) !== "2";
        const migrate = oldDefaults && (habit.name === "金刚功" && habit.count === 7 && habit.minutes === 30 || habit.name === "敲胆经" && habit.count === 0 && habit.minutes === 0);
        const savedChecks = checks && typeof checks === "object" ? checks[habit.name] : undefined;
        return {
          id: `legacy-${index}`,
          name: habit.name.trim().slice(0, 100),
          count: migrate ? 7 : Math.max(1, Math.min(7, Math.round(Number(habit.count) || 7))),
          minutes: migrate ? 20 : Math.max(0, Math.min(1440, Number(habit.minutes) || 0)),
          checks: Array.from({
            length: 7
          }, (_, day) => Array.isArray(savedChecks) && savedChecks[day] === true)
        };
      });
    }
  } catch {/* Leave old browser data intact if it cannot be imported. */}
  return patch;
}
