export type HabitUnit = "boolean" | "minutes" | "times" | "time";

export interface Habit {
  id: string;
  name: string;
  category: string;
  target: number;
  unit: HabitUnit;
  color: string;
  sortOrder: number;
}

export interface RecordEntry {
  habitId: string;
  date: string;
  value: number;
  completed: 0 | 1;
  note: string | null;
}

export interface DayInfo {
  date: string;
  day: number;
  weekday: number;
  label: string;
}

export interface DailyStat {
  date: string;
  day: number;
  weekday: number;
  label: string;
  planned: number;
  completed: number;
  rate: number;
  value: number;
}

export interface HabitStat {
  habitId: string;
  name: string;
  category: string;
  color: string;
  unit: HabitUnit;
  target: number;
  values: number[];
  scores: number[];
  count: number;
  planned: number;
  rate: number;
  value: number;
}

export interface OverallStat {
  target: number;
  completed: number;
  rate: number;
  value: number;
  perfectDays: number;
  activeDays: number;
  streak: number;
  demoSeeded: boolean;
}

export interface MonthData {
  year: number;
  month: number;
  today: string;
  note: string;
  days: DayInfo[];
  habits: Habit[];
  records: RecordEntry[];
  dailyStats: DailyStat[];
  habitStats: HabitStat[];
  overall: OverallStat;
}

export interface HabitInput {
  name: string;
  category: string;
  target: number;
  unit: HabitUnit;
  color: string;
}
