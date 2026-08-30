import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Habit, HabitInput, HabitUnit } from "./types";
import { getMonthKeyFromDate, isValidMonthKey } from "./month";
import { getHabitToday } from "./time";

let database: Database.Database | null = null;

function getDatabasePath() {
  const base = process.env.DATABASE_PATH
    ? path.dirname(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data");
  fs.mkdirSync(base, { recursive: true });
  return process.env.DATABASE_PATH || path.join(base, "habits.db");
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function createDatabase() {
  const db = new Database(getDatabasePath());
  db.pragma("busy_timeout = 5000");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      target REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'boolean',
      color TEXT NOT NULL DEFAULT '#3b82f6',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_template INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS records (
      habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (habit_id, date)
    );

    CREATE TABLE IF NOT EXISTS month_habit_snapshots (
      month TEXT NOT NULL,
      habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      target REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'boolean',
      color TEXT NOT NULL DEFAULT '#3b82f6',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (month, habit_id)
    );

    CREATE INDEX IF NOT EXISTS idx_month_habit_snapshots_month
      ON month_habit_snapshots (month, sort_order);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weekly_tasks (
      id TEXT PRIMARY KEY,
      week_start TEXT NOT NULL,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      actual_time TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weekly_diaries (
      week_start TEXT NOT NULL,
      date TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (week_start, date)
    );

    CREATE INDEX IF NOT EXISTS idx_weekly_tasks_date
      ON weekly_tasks (week_start, date);
  `);

  migrateSchema(db);
  seedDefaultHabits(db);
  seedDemoRecords(db);

  return db;
}

function migrateSchema(db: Database.Database) {
  const version = db
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;
  const currentVersion = Number(version?.value ?? 0);

  const habitColumns = db
    .prepare("PRAGMA table_info(habits)")
    .all() as Array<{ name: string }>;
  if (!habitColumns.some((column) => column.name === "is_template")) {
    db.exec(
      "ALTER TABLE habits ADD COLUMN is_template INTEGER NOT NULL DEFAULT 1",
    );
  }

  if (currentVersion >= 4) {
    backfillMonthSnapshots(db);
    return;
  }

  const habitsCount = db
    .prepare("SELECT COUNT(*) AS count FROM habits")
    .get() as { count: number };

  if (!version && habitsCount.count > 0) {
    const dbPath = getDatabasePath();
    const backupPath = `${dbPath}.bak-v1`;
    if (!fs.existsSync(backupPath)) {
      db.pragma("wal_checkpoint(TRUNCATE)");
      fs.copyFileSync(dbPath, backupPath);
    }
  }

  const defaultsSeeded = db
    .prepare("SELECT value FROM meta WHERE key = 'default_habits_seeded'")
    .get() as { value: string } | undefined;
  if (habitsCount.count > 0 && !defaultsSeeded) {
    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('default_habits_seeded', '1')",
    ).run();
  }

  const snapshotCount = db
    .prepare("SELECT COUNT(*) AS count FROM month_habit_snapshots")
    .get() as { count: number };
  if (snapshotCount.count > 0) {
    // v3 曾让新月份继承最新快照，这里重建为独立的模板副本。
    db.exec("DELETE FROM month_habit_snapshots");
  }

  backfillMonthSnapshots(db);
  db.prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '4')",
  ).run();
}

function getTemplateHabitRows(db: Database.Database): Habit[] {
  return db
    .prepare(`
      SELECT id, name, category, target, unit, color, sort_order AS sortOrder
      FROM habits
      WHERE is_template = 1
      ORDER BY sort_order
    `)
    .all() as Habit[];
}

export function ensureMonthHabitSnapshot(
  month: string,
  db: Database.Database = getDatabase(),
) {
  if (!isValidMonthKey(month)) return;

  const existing = db
    .prepare(
      "SELECT COUNT(*) AS count FROM month_habit_snapshots WHERE month = ?",
    )
    .get(month) as { count: number };
  if (existing.count > 0) return;

  // 每个月份都从同一个模板复制，互不继承。
  const rows = getTemplateHabitRows(db);

  if (rows.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO month_habit_snapshots
      (month, habit_id, name, category, target, unit, color, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const transaction = db.transaction(() => {
    rows.forEach((habit) => {
      insert.run(
        month,
        habit.id,
        habit.name,
        habit.category,
        habit.target,
        habit.unit,
        habit.color,
        habit.sortOrder,
      );
    });
  });
  transaction();
}

function backfillMonthSnapshots(db: Database.Database) {
  const months = db
    .prepare(
      "SELECT DISTINCT substr(date, 1, 7) AS month FROM records ORDER BY month",
    )
    .all() as Array<{ month: string }>;

  for (const row of months) {
    if (isValidMonthKey(row.month)) {
      ensureMonthHabitSnapshot(row.month, db);
    }
  }
}

function seedDefaultHabits(db: Database.Database) {
  const seeded = db
    .prepare("SELECT value FROM meta WHERE key = 'default_habits_seeded'")
    .get() as { value: string } | undefined;
  if (seeded) return;

  const defaults: HabitInput[] = [
    {
      name: "早睡",
      category: "sleep",
      target: 22 * 60 + 30,
      unit: "time",
      color: "#f28e2b",
    },
    {
      name: "早起",
      category: "sleep",
      target: 6 * 60 + 30,
      unit: "time",
      color: "#76b7b2",
    },
    {
      name: "站桩",
      category: "practice",
      target: 30,
      unit: "minutes",
      color: "#4e79a7",
    },
    {
      name: "打坐",
      category: "practice",
      target: 20,
      unit: "minutes",
      color: "#e15759",
    },
    {
      name: "持五戒",
      category: "practice",
      target: 1,
      unit: "boolean",
      color: "#8c6bb1",
    },
    {
      name: "文史",
      category: "reading",
      target: 30,
      unit: "minutes",
      color: "#59a14f",
    },
    {
      name: "哲思",
      category: "reading",
      target: 30,
      unit: "minutes",
      color: "#edc948",
    },
  ];

  const insert = db.prepare(`
    INSERT INTO habits (id, name, category, target, unit, color, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const existing = new Set(
    (
      db
        .prepare("SELECT name, category FROM habits")
        .all() as Array<{ name: string; category: string }>
    ).map((habit) => `${habit.category}:${habit.name}`),
  );
  const orderRow = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS nextOrder FROM habits")
    .get() as { nextOrder: number };
  let nextOrder = orderRow.nextOrder;

  const transaction = db.transaction(() => {
    defaults.forEach((habit) => {
      if (existing.has(`${habit.category}:${habit.name}`)) return;
      nextOrder += 1;
      insert.run(
        randomUUID(),
        habit.name,
        habit.category,
        habit.target,
        habit.unit,
        habit.color,
        nextOrder,
      );
    });
  });

  transaction();

  db.prepare(
    "UPDATE habits SET color = ? WHERE name = ? AND category = ? AND color = ?",
  ).run("#f28e2b", "早睡", "sleep", "#4e79a7");
  db.prepare(
    "UPDATE habits SET color = ? WHERE name = ? AND category = ? AND color = ?",
  ).run("#4e79a7", "站桩", "practice", "#f28e2b");

  db.prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('default_habits_seeded', '1')",
  ).run();
}

function seedDemoRecords(db: Database.Database) {
  const seeded = db
    .prepare("SELECT value FROM meta WHERE key = 'demo_seeded'")
    .get() as { value: string } | undefined;
  if (seeded) return;

  const habits = db
    .prepare("SELECT id, name, target, unit FROM habits ORDER BY sort_order")
    .all() as Pick<Habit, "id" | "name" | "target" | "unit">[];

  const today = getHabitToday();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate();
  const todayDay = Number(today.slice(8, 10));
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO records (habit_id, date, value, completed, note)
    VALUES (?, ?, ?, ?, 'demo')
  `);

  const transaction = db.transaction(() => {
    for (const habit of habits) {
      for (let day = 1; day < todayDay && day <= lastDay; day += 1) {
        const date = `${monthPrefix}-${String(day).padStart(2, "0")}`;
        const hash = hashString(`${habit.id}:${date}`);
        if (hash % 23 === 0) continue;

        if (habit.unit === "boolean") {
          const completed = hash % 7 < 5 ? 1 : 0;
          insert.run(habit.id, date, completed, completed);
          continue;
        }

        if (habit.unit === "time") {
          const earlyOffsets = [-35, -20, -10, 0, 8, 20, 35, 55, 75, 90];
          const lateOffsets = [-45, -30, -18, -6, 0, 12, 28, 45, 60];
          const isSleep = habit.name === "早睡" || habit.name.includes("睡");
          const offsets = isSleep ? earlyOffsets : lateOffsets;
          const value =
            ((habit.target + offsets[hash % offsets.length]) % 1440 + 1440) %
            1440;
          const lateMinutes = value - habit.target;
          const tolerance = isSleep ? 90 : 60;
          const completed =
            lateMinutes <= 0 || lateMinutes <= tolerance ? 1 : 0;
          insert.run(habit.id, date, value, completed);
          continue;
        }

        const ratios = [0.4, 0.6, 0.8, 1];
        const ratio = ratios[hash % ratios.length];
        const value = Math.round(habit.target * ratio * 10) / 10;
        const completed = value >= habit.target * 0.8 && value > 0 ? 1 : 0;
        insert.run(habit.id, date, value, completed);
      }
    }

    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('demo_seeded', '1')",
    ).run();
  });

  transaction();
}

export function getDatabase() {
  if (!database) {
    database = createDatabase();
  }
  return database;
}

export function createHabit(input: HabitInput, month: string) {
  const db = getDatabase();
  ensureMonthHabitSnapshot(month, db);

  const orderRow = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS nextOrder FROM month_habit_snapshots WHERE month = ?",
    )
    .get(month) as { nextOrder: number };
  const sortOrder = orderRow.nextOrder + 1;
  const habit: Habit = {
    id: randomUUID(),
    name: input.name.trim(),
    category: input.category,
    target: input.target,
    unit: input.unit as HabitUnit,
    color: input.color,
    sortOrder,
  };

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO habits (id, name, category, target, unit, color, sort_order, is_template)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      habit.id,
      habit.name,
      habit.category,
      habit.target,
      habit.unit,
      habit.color,
      habit.sortOrder,
    );

    db.prepare(`
      INSERT INTO month_habit_snapshots
        (month, habit_id, name, category, target, unit, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      month,
      habit.id,
      habit.name,
      habit.category,
      habit.target,
      habit.unit,
      habit.color,
      habit.sortOrder,
    );
  });
  transaction();

  return habit;
}

export function updateHabitForMonth(
  month: string,
  id: string,
  input: Partial<HabitInput>,
): Habit | null {
  const db = getDatabase();
  ensureMonthHabitSnapshot(month, db);
  const current = db
    .prepare(`
      SELECT habit_id AS id, name, category, target, unit, color, sort_order AS sortOrder
      FROM month_habit_snapshots
      WHERE month = ? AND habit_id = ?
    `)
    .get(month, id) as Habit | undefined;
  if (!current) return null;

  const next: Habit = {
    ...current,
    ...input,
    name: (input.name ?? current.name).trim(),
  };

  db.prepare(`
    UPDATE month_habit_snapshots
    SET name = ?, category = ?, target = ?, unit = ?, color = ?
    WHERE month = ? AND habit_id = ?
  `).run(
    next.name,
    next.category,
    next.target,
    next.unit,
    next.color,
    month,
    id,
  );

  return next;
}

export function deleteHabitForMonth(month: string, id: string) {
  const db = getDatabase();
  ensureMonthHabitSnapshot(month, db);
  const existing = db
    .prepare(
      "SELECT 1 FROM month_habit_snapshots WHERE month = ? AND habit_id = ?",
    )
    .get(month, id);
  if (!existing) return false;

  const transaction = db.transaction(() => {
    db.prepare(
      "DELETE FROM month_habit_snapshots WHERE month = ? AND habit_id = ?",
    ).run(month, id);
    db.prepare(
      "DELETE FROM records WHERE habit_id = ? AND date LIKE ?",
    ).run(id, `${month}-%`);
  });
  transaction();
  return true;
}

export function upsertRecord(
  habitId: string,
  date: string,
  value: number,
  completed: boolean,
  note?: string,
) {
  const db = getDatabase();
  const month = getMonthKeyFromDate(date);
  if (!month) return false;
  ensureMonthHabitSnapshot(month, db);
  const active = db
    .prepare(
      "SELECT 1 FROM month_habit_snapshots WHERE month = ? AND habit_id = ?",
    )
    .get(month, habitId);
  if (!active) return false;

  db.prepare(`
    INSERT INTO records (habit_id, date, value, completed, note)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(habit_id, date) DO UPDATE SET
      value = excluded.value,
      completed = excluded.completed,
      note = COALESCE(excluded.note, records.note),
      updated_at = datetime('now')
  `).run(habitId, date, value, completed ? 1 : 0, note ?? null);

  return true;
}

export function deleteRecordsForMonth(month: string) {
  const db = getDatabase();
  const result = db
    .prepare("DELETE FROM records WHERE date LIKE ?")
    .run(`${month}-%`);
  return result.changes;
}
