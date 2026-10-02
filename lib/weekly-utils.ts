import type { WeeklyData, WeeklyHabit, WeeklyTask } from "./weekly-types";
export const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const TASK_TYPE_LABELS = {
  once: "单次任务",
  daily: "重复任务",
  weekly: "本周一次"
};
export const TASK_CATEGORY_LABELS = {
  recitation: "背诵",
  practice: "实修",
  reading: "阅读",
  work: "工作",
  leisure: "业余"
};
export function addWeekDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function weekStartOf(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return addWeekDays(value, -((date.getUTCDay() + 6) % 7));
}
export function weekNumber(value: string) {
  const thursday = new Date(`${addWeekDays(weekStartOf(value), 3)}T12:00:00Z`);
  const first = weekStartOf(`${thursday.getUTCFullYear()}-01-04`);
  return 1 + Math.round((new Date(`${weekStartOf(value)}T12:00:00Z`).getTime() - new Date(`${first}T12:00:00Z`).getTime()) / 604800000);
}
export function formatWeeklyDuration(value: number) {
  const minutes = Math.round(value);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} 小时${rest ? ` ${rest} 分` : ""}` : `${rest} 分钟`;
}
export function taskTarget(task: WeeklyTask) {
  return task.taskType === "daily" ? task.targetCount : 1;
}
export function defaultWeeklyHabits(): WeeklyHabit[] {
  return ["金刚功", "敲胆经"].map((name, index) => ({
    id: `default-${index}`,
    name,
    count: 7,
    minutes: 20,
    checks: Array<boolean>(7).fill(false)
  }));
}
export function weeklyStats(data: Pick<WeeklyData, "tasks" | "records">) {
  const totalTasks = data.tasks.reduce((sum, task) => sum + taskTarget(task), 0);
  const completedTasks = data.tasks.reduce((sum, task) => sum + Math.min(taskTarget(task), data.records.filter(record => record.scheduleTaskId === task.id && record.completed === 1).length), 0);
  return {
    totalTasks,
    completedTasks,
    completionRate: totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0
  };
}
