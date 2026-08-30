import { randomUUID } from "node:crypto";
import { getDatabase } from "./db";
import type {
  WeeklyData,
  WeeklyDay,
  WeeklyDiary,
  WeeklyTask,
} from "./weekly-types";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

export function getCurrentWeekStart() {
  const now = new Date();
  const monday = new Date(now);
  const day = now.getDay();
  const offset = day === 0 ? 6 : day - 1;
  monday.setDate(now.getDate() - offset);
  return formatDate(monday);
}

export function normalizeWeekStart(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return formatDate(date);
    }
  }
  return getCurrentWeekStart();
}

export function addDays(dateString: string, amount: number) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return formatDate(date);
}

export function getWeeklyData(weekStart: string): WeeklyData {
  const db = getDatabase();
  const start = normalizeWeekStart(weekStart);
  const today = formatDate(new Date());
  const labels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const days: WeeklyDay[] = labels.map((label, index) => {
    const date = addDays(start, index);
    return { date, label, isToday: date === today };
  });

  const tasks = db
    .prepare(`
      SELECT
        id,
        week_start AS weekStart,
        date,
        title,
        actual_time AS actualTime,
        completed,
        created_at AS createdAt
      FROM weekly_tasks
      WHERE week_start = ?
      ORDER BY date, created_at
    `)
    .all(start) as WeeklyTask[];

  const diaries = db
    .prepare(`
      SELECT
        week_start AS weekStart,
        date,
        content,
        updated_at AS updatedAt
      FROM weekly_diaries
      WHERE week_start = ?
      ORDER BY date
    `)
    .all(start) as WeeklyDiary[];

  const completedTasks = tasks.filter(
    (task) => task.completed === 1,
  ).length;

  return {
    weekStart: start,
    days,
    tasks,
    diaries,
    totalTasks: tasks.length,
    completedTasks,
    completionRate:
      tasks.length > 0
        ? Math.round((completedTasks / tasks.length) * 100)
        : 0,
  };
}

export function createWeeklyTask({
  weekStart,
  date,
  title,
}: {
  weekStart: string;
  date: string;
  title: string;
}) {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO weekly_tasks (id, week_start, date, title)
    VALUES (?, ?, ?, ?)
  `).run(id, weekStart, date, title.trim());
  return id;
}

export function updateWeeklyTask(
  id: string,
  input: {
    title?: string;
    actualTime?: string;
    completed?: boolean;
  },
) {
  const db = getDatabase();
  const current = db
    .prepare("SELECT * FROM weekly_tasks WHERE id = ?")
    .get(id) as
    | {
        title: string;
        actual_time: string;
        completed: number;
      }
    | undefined;
  if (!current) return false;

  db.prepare(`
    UPDATE weekly_tasks
    SET
      title = ?,
      actual_time = ?,
      completed = ?
    WHERE id = ?
  `).run(
    input.title ?? current.title,
    input.actualTime ?? current.actual_time,
    input.completed === undefined
      ? current.completed
      : input.completed
        ? 1
        : 0,
    id,
  );
  return true;
}

export function deleteWeeklyTask(id: string) {
  const db = getDatabase();
  db.prepare("DELETE FROM weekly_tasks WHERE id = ?").run(id);
}

export function upsertWeeklyDiary({
  weekStart,
  date,
  content,
}: {
  weekStart: string;
  date: string;
  content: string;
}) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO weekly_diaries (week_start, date, content)
    VALUES (?, ?, ?)
    ON CONFLICT(week_start, date) DO UPDATE SET
      content = excluded.content,
      updated_at = datetime('now')
  `).run(weekStart, date, content);
}
