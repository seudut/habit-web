import { randomUUID } from "node:crypto";
import { getDatabase } from "./db";
import type {
  WeeklyCategory,
  WeeklyData,
  WeeklyDay,
  WeeklyDiary,
  WeeklyRecord,
  WeeklyTask,
  WeeklyTaskType,
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
      const day = date.getDay();
      date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
      return formatDate(date);
    }
  }
  return getCurrentWeekStart();
}

export function isValidDateString(
  value: string | undefined,
): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && formatDate(date) === value;
}

export function isDateWithinWeek(date: string, weekStart: string) {
  const start = normalizeWeekStart(weekStart);
  for (let index = 0; index < 7; index += 1) {
    if (addDays(start, index) === date) return true;
  }
  return false;
}

export function getWeeklyTaskById(id: string) {
  const db = getDatabase();
  return db
    .prepare(`
      SELECT
        id,
        week_start AS weekStart,
        title,
        estimated_duration AS estimatedDuration,
        task_type AS taskType,
        category,
        created_at AS createdAt
      FROM weekly_schedule_tasks
      WHERE id = ?
    `)
    .get(id) as WeeklyTask | undefined;
}

export function hasWeeklyRecordForWeek(
  scheduleTaskId: string,
  weekStart: string,
) {
  const db = getDatabase();
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM weekly_task_records WHERE schedule_task_id = ? AND week_start = ? LIMIT 1",
      )
      .get(scheduleTaskId, weekStart),
  );
}

export function hasWeeklyRecordOnDate(
  scheduleTaskId: string,
  weekStart: string,
  date: string,
) {
  const db = getDatabase();
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM weekly_task_records WHERE schedule_task_id = ? AND week_start = ? AND date = ? LIMIT 1",
      )
      .get(scheduleTaskId, weekStart, date),
  );
}

export function countWeeklyRecordsForTask(scheduleTaskId: string) {
  const db = getDatabase();
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM weekly_task_records WHERE schedule_task_id = ?",
    )
    .get(scheduleTaskId) as { count: number };
  return row.count;
}

export function isValidDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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
  const labels = [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ];
  const days: WeeklyDay[] = labels.map((label, index) => {
    const date = addDays(start, index);
    return { date, label, isToday: date === today };
  });

  const tasks = db
    .prepare(`
      SELECT
        id,
        week_start AS weekStart,
        title,
        estimated_duration AS estimatedDuration,
        task_type AS taskType,
        category,
        created_at AS createdAt
      FROM weekly_schedule_tasks
      WHERE week_start = ?
      ORDER BY created_at
    `)
    .all(start) as WeeklyTask[];

  const records = db
    .prepare(`
      SELECT
        id,
        schedule_task_id AS scheduleTaskId,
        week_start AS weekStart,
        date,
        actual_duration AS actualDuration,
        completed,
        created_at AS createdAt
      FROM weekly_task_records
      WHERE week_start = ?
      ORDER BY date, created_at
    `)
    .all(start) as WeeklyRecord[];

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

  const completedTasks = new Set(
    records
      .filter((record) => record.completed === 1)
      .map((record) => record.scheduleTaskId),
  ).size;

  return {
    weekStart: start,
    days,
    tasks,
    records,
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
  title,
  estimatedDuration,
  taskType,
  category,
}: {
  weekStart: string;
  title: string;
  estimatedDuration: number;
  taskType: WeeklyTaskType;
  category: WeeklyCategory;
}) {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO weekly_schedule_tasks
      (id, week_start, title, estimated_duration, task_type, category)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    weekStart,
    title.trim(),
    estimatedDuration,
    taskType,
    category,
  );
  return id;
}

function normalizeDuration(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

export function updateWeeklyTask(
  id: string,
  input: {
    title?: string;
    estimatedDuration?: number;
    taskType?: WeeklyTaskType;
    category?: WeeklyCategory;
  },
) {
  const db = getDatabase();
  const current = db
    .prepare("SELECT * FROM weekly_schedule_tasks WHERE id = ?")
    .get(id) as
    | {
        title: string;
        estimated_duration: number;
        task_type: string;
        category: string;
      }
    | undefined;
  if (!current) return false;

  db.prepare(`
    UPDATE weekly_schedule_tasks
    SET
      title = ?,
      estimated_duration = ?,
      task_type = ?,
      category = ?
    WHERE id = ?
  `).run(
    input.title ?? current.title,
    normalizeDuration(input.estimatedDuration ?? current.estimated_duration),
    input.taskType ?? current.task_type,
    input.category ?? current.category,
    id,
  );
  return true;
}

export function deleteWeeklyTask(id: string) {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM weekly_schedule_tasks WHERE id = ?").run(id);
  return result.changes > 0;
}

export function createWeeklyRecord({
  scheduleTaskId,
  weekStart,
  date,
  actualDuration = 0,
}: {
  scheduleTaskId: string;
  weekStart: string;
  date: string;
  actualDuration?: number;
}) {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO weekly_task_records
      (id, schedule_task_id, week_start, date, actual_duration)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    scheduleTaskId,
    normalizeWeekStart(weekStart),
    date,
    normalizeDuration(actualDuration),
  );
  return id;
}

export function updateWeeklyRecord(
  id: string,
  input: {
    actualDuration?: number;
    completed?: boolean;
  },
) {
  const db = getDatabase();
  const current = db
    .prepare("SELECT * FROM weekly_task_records WHERE id = ?")
    .get(id) as
    | {
        actual_duration: number;
        completed: number;
      }
    | undefined;
  if (!current) return false;

  db.prepare(`
    UPDATE weekly_task_records
    SET
      actual_duration = ?,
      completed = ?
    WHERE id = ?
  `).run(
    input.actualDuration ?? current.actual_duration,
    input.completed === undefined
      ? current.completed
      : input.completed
        ? 1
        : 0,
    id,
  );
  return true;
}

export function deleteWeeklyRecord(id: string) {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM weekly_task_records WHERE id = ?").run(id);
  return result.changes > 0;
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
