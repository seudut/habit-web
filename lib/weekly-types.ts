export type WeeklyTaskType = "once" | "daily" | "weekly";
export type WeeklyCategory = "recitation" | "practice" | "reading" | "work" | "leisure";
export interface WeeklyTask {
  id: string;
  weekStart: string;
  title: string;
  estimatedDuration: number;
  taskType: WeeklyTaskType;
  targetCount: number;
  category: WeeklyCategory;
  createdAt: string;
}
export interface WeeklyRecord {
  id: string;
  scheduleTaskId: string;
  weekStart: string;
  date: string;
  actualDuration: number;
  completed: 0 | 1;
  createdAt: string;
}
export interface WeeklyDiary {
  weekStart: string;
  date: string;
  content: string;
  updatedAt: string;
}
export interface WeeklyDay {
  date: string;
  label: string;
  isToday: boolean;
}
export interface WeeklyData {
  weekStart: string;
  days: WeeklyDay[];
  tasks: WeeklyTask[];
  records: WeeklyRecord[];
  diaries: WeeklyDiary[];
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  today: string;
  preferences: WeeklyPreferences;
}
export interface WeeklyHabit {
  id: string;
  name: string;
  count: number;
  minutes: number;
  checks: boolean[];
}
export interface WeeklyPreferences {
  review: string;
  budgetMinutes: number;
  habits: WeeklyHabit[];
  initialized: boolean;
}
