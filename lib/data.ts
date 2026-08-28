import { getDatabase } from "./db";
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

function getLocalToday() {
  const now = new Date();
  return formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function getMonthData(year: number, month: number): MonthData {
  const db = getDatabase();
  const today = getLocalToday();
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthPrefix = `${year}-${pad(month)}`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const startDate = `${monthPrefix}-01`;
  const endDate = formatDate(nextYear, nextMonth, 1);

  const habits = db
    .prepare("SELECT * FROM habits ORDER BY sort_order")
    .all() as Habit[];

  const records = db
    .prepare(`
      SELECT habit_id AS habitId, date, value, completed, note
      FROM records
      WHERE date >= ? AND date < ?
      ORDER BY date
    `)
    .all(startDate, endDate) as RecordEntry[];

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
    const completed = habits.filter(
      (habit) =>
        recordMap.get(`${habit.id}:${day.date}`)?.completed === 1,
    ).length;
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
      rate: planned > 0 ? Math.round((completed / planned) * 1000) / 10 : 0,
      value: Math.round(value * 10) / 10,
    };
  });

  const habitStats: HabitStat[] = habits.map((habit) => {
    const habitRecords = records.filter(
      (record) => record.habitId === habit.id,
    );
    const count = habitRecords.filter((record) => record.completed === 1).length;
    const value = Math.round(
      habitRecords.reduce((sum, record) => sum + record.value, 0) * 10,
    ) / 10;

    return {
      habitId: habit.id,
      name: habit.name,
      category: habit.category,
      color: habit.color,
      count,
      planned: days.length,
      rate:
        days.length > 0
          ? Math.round((count / days.length) * 1000) / 10
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
  const perfectDays = dailyStats.filter(
    (stat) => stat.planned > 0 && stat.completed === stat.planned,
  ).length;
  const activeDays = dailyStats.filter((stat) => stat.completed > 0).length;

  const todayDay = today.startsWith(monthPrefix)
    ? Number(today.slice(8, 10))
    : daysInMonth;
  let streak = 0;
  const anchorDay = todayDay > 1 ? todayDay - 1 : daysInMonth;
  for (let day = anchorDay; day >= 1; day -= 1) {
    const stat = dailyStats[day - 1];
    if (stat.completed === stat.planned && stat.planned > 0) {
      streak += 1;
    } else {
      break;
    }
  }

  const overall: OverallStat = {
    target,
    completed,
    rate:
      target > 0 ? Math.round((completed / target) * 1000) / 10 : 0,
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
