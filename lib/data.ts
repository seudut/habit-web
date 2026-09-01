import { ensureMonthHabitSnapshot, getDatabase } from "./db";
import { computeHabitScore } from "./scoring";
import { getMonthKey } from "./month";
import { getHabitToday } from "./time";
import type {
  DayInfo,
  DailyStat,
  Habit,
  HabitStat,
  MonthData,
  OverallStat,
  RecordEntry,
} from "./types";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function getMonthData(year: number, month: number): MonthData {
  const db = getDatabase();
  const today = getHabitToday();
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthPrefix = getMonthKey(year, month);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const startDate = `${monthPrefix}-01`;
  const endDate = formatDate(nextYear, nextMonth, 1);

  ensureMonthHabitSnapshot(monthPrefix, db);

  const habits = db
    .prepare(`
      SELECT habit_id AS id, name, category, target, unit, color, sort_order AS sortOrder
      FROM month_habit_snapshots
      WHERE month = ?
      ORDER BY sort_order
    `)
    .all(monthPrefix) as Habit[];

  const allRecords = db
    .prepare(`
      SELECT habit_id AS habitId, date, value, completed, note
      FROM records
      WHERE date >= ? AND date < ?
      ORDER BY date
    `)
    .all(startDate, endDate) as RecordEntry[];
  const activeHabitIds = new Set(habits.map((habit) => habit.id));
  const records = allRecords.filter((record) =>
    activeHabitIds.has(record.habitId),
  );

  const days: DayInfo[] = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = formatDate(year, month, day);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const weekday = dateObj.getUTCDay();
    return {
      date,
      day,
      weekday,
      label: WEEKDAY_LABELS[weekday],
    };
  });

  const recordMap = new Map(
    records.map((record) => [`${record.habitId}:${record.date}`, record]),
  );

  const dailyStats: DailyStat[] = days.map((day) => {
    const scores = habits.map((habit) =>
      computeHabitScore(
        habit,
        recordMap.get(`${habit.id}:${day.date}`),
      ),
    );
    const completed = scores.filter((score) => score >= 80).length;
    const value = habits.reduce(
      (sum, habit) =>
        sum + (recordMap.get(`${habit.id}:${day.date}`)?.value ?? 0),
      0,
    );
    const planned = habits.length;

    return {
      ...day,
      planned,
      completed,
      rate:
        planned > 0
          ? Math.round(
              (scores.reduce((sum, score) => sum + score, 0) / planned) * 10,
            ) / 10
          : 0,
      value: Math.round(value * 10) / 10,
    };
  });

  const habitStats: HabitStat[] = habits.map((habit) => {
    const values = days.map(
      (day) => recordMap.get(`${habit.id}:${day.date}`)?.value ?? 0,
    );
    const scores = values.map((_, index) =>
      computeHabitScore(
        habit,
        recordMap.get(`${habit.id}:${days[index].date}`),
      ),
    );
    const count = scores.filter((score) => score >= 80).length;
    const value = Math.round(
      values.reduce((sum, item) => sum + item, 0) * 10,
    ) / 10;

    return {
      habitId: habit.id,
      name: habit.name,
      category: habit.category,
      color: habit.color,
      unit: habit.unit,
      target: habit.target,
      values,
      scores,
      count,
      planned: days.length,
      rate:
        days.length > 0
          ? Math.round(
              (scores.reduce((sum, score) => sum + score, 0) /
                days.length) *
                10,
            ) / 10
          : 0,
      value,
    };
  });

  const completed = dailyStats.reduce(
    (sum, stat) => sum + stat.completed,
    0,
  );
  const target = dailyStats.reduce((sum, stat) => sum + stat.planned, 0);
  const value = dailyStats.reduce((sum, stat) => sum + stat.value, 0);
  const cellCount = habits.length * days.length;
  const scoreTotal = habitStats.reduce(
    (sum, stat) =>
      sum + stat.scores.reduce((scoreSum, score) => scoreSum + score, 0),
    0,
  );
  const perfectDays = dailyStats.filter(
    (stat) => stat.planned > 0 && stat.rate === 100,
  ).length;
  const activeDays = dailyStats.filter((stat) => stat.rate > 0).length;

  const todayDay = today.startsWith(monthPrefix)
    ? Number(today.slice(8, 10))
    : daysInMonth;
  let streak = 0;
  const anchorDay = todayDay > 1 ? todayDay - 1 : daysInMonth;
  for (let day = anchorDay; day >= 1; day -= 1) {
    const stat = dailyStats[day - 1];
    if (stat.rate === 100 && stat.planned > 0) {
      streak += 1;
    } else {
      break;
    }
  }

  const overall: OverallStat = {
    target,
    completed,
    rate:
      cellCount > 0
        ? Math.round((scoreTotal / cellCount) * 10) / 10
        : 0,
    value: Math.round(value * 10) / 10,
    perfectDays,
    activeDays,
    streak,
    demoSeeded: true,
  };

  return {
    year,
    month,
    today,
    days,
    habits,
    records,
    dailyStats,
    habitStats,
    overall,
  };
}
