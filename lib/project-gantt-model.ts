import type { Project, ProjectTask } from "./project-types";

export interface DateRange { startDate: string; endDate: string }
export type TaskFilter = "all" | "unfinished" | "overdue" | "completed";
export type DragSide = "start" | "end" | "move";
export const TIMELINE_DAYS = 90;

export function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function getToday() { return formatDate(new Date()); }
export function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
export function addDays(date: string, amount: number) {
  const next = parseDate(date);
  next.setDate(next.getDate() + amount);
  return formatDate(next);
}
export function diffDays(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}
export function isValidDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && formatDate(parseDate(value)) === value;
}
export function getInitialViewStart(today: string) {
  return addDays(`${today.slice(0, 7)}-01`, -7);
}
export function formatShortDate(date: string, today = getToday()) {
  const [year, month, day] = date.split("-");
  return `${year === today.slice(0, 4) ? "" : `${year}/`}${month}/${day}`;
}
export function formatDateRange(start: string, end: string) {
  return `${formatShortDate(start)} — ${formatShortDate(end)}`;
}
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
export function allTasks(project: Project) {
  return project.tasks.flatMap((task) => [task, ...task.children]);
}
export function leafTasks(project: Project) {
  return project.tasks.flatMap((task) => task.children.length ? task.children : [task]);
}
export function projectSummary(project: Project) {
  const leaves = leafTasks(project);
  return {
    total: leaves.length,
    completed: leaves.filter((task) => task.progress === 100).length,
    progress: leaves.length ? Math.round(leaves.reduce((sum, task) => sum + task.progress, 0) / leaves.length) : 0,
  };
}
export function taskStatus(task: ProjectTask, today: string) {
  if (task.progress === 100) return { label: "已完成", kind: "completed" };
  if (task.endDate < today) return { label: "逾期", kind: "overdue" };
  if (task.progress > 0) return { label: "进行中", kind: "active" };
  return { label: "未开始", kind: "pending" };
}
export function matchesTask(task: ProjectTask, filter: TaskFilter, today: string) {
  return filter === "all" ||
    (filter === "unfinished" && task.progress < 100) ||
    (filter === "completed" && task.progress === 100) ||
    (filter === "overdue" && task.progress < 100 && task.endDate < today);
}
export function taskBounds(project: Project, drafts: Record<string, DateRange> = {}) {
  const ranges = allTasks(project).map((task) => drafts[task.id] ?? task)
    .filter((range) => isValidDateValue(range.startDate) && isValidDateValue(range.endDate) && range.endDate >= range.startDate);
  if (!ranges.length) return null;
  return {
    startDate: ranges.reduce((date, task) => task.startDate < date ? task.startDate : date, ranges[0].startDate),
    endDate: ranges.reduce((date, task) => task.endDate > date ? task.endDate : date, ranges[0].endDate),
  };
}
export function projectRange(project: Project, drafts: Record<string, DateRange> = {}, draft?: DateRange): DateRange {
  const base = draft ?? project;
  const bounds = taskBounds(project, drafts);
  return {
    startDate: bounds && bounds.startDate < base.startDate ? bounds.startDate : base.startDate,
    endDate: bounds && bounds.endDate > base.endDate ? bounds.endDate : base.endDate,
  };
}
export function dragDates(range: DateRange, side: DragSide, delta: number, bounds?: DateRange | null): DateRange {
  if (side === "move") return { startDate: addDays(range.startDate, delta), endDate: addDays(range.endDate, delta) };
  if (side === "start") {
    const limit = bounds && bounds.startDate < range.endDate ? bounds.startDate : range.endDate;
    return { startDate: addDays(range.startDate, Math.min(delta, diffDays(range.startDate, limit))), endDate: range.endDate };
  }
  const limit = bounds && bounds.endDate > range.startDate ? bounds.endDate : range.startDate;
  return { startDate: range.startDate, endDate: addDays(range.endDate, Math.max(delta, diffDays(range.endDate, limit))) };
}
export function barGeometry(range: DateRange, viewStart: string, days = TIMELINE_DAYS) {
  const viewEnd = addDays(viewStart, days - 1);
  if (range.endDate < viewStart) return { outside: "before" as const };
  if (range.startDate > viewEnd) return { outside: "after" as const };
  const start = Math.max(0, diffDays(viewStart, range.startDate));
  const end = Math.min(days - 1, diffDays(viewStart, range.endDate));
  return { outside: null, start, length: end - start + 1, clippedStart: range.startDate < viewStart, clippedEnd: range.endDate > viewEnd };
}
