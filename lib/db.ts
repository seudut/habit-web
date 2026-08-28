import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Habit, HabitInput, HabitUnit } from "./types";

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

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
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
  if (version) return;

  const habitsCount = db
    .prepare("SELECT COUNT(*) AS count FROM habits")
    .get() as { count: number };

  if (habitsCount.count > 0) {
    const dbPath = getDatabasePath();
    const backupPath = `${dbPath}.bak-v1`;
    if (!fs.existsSync(backupPath)) {
      db.pragma("wal_checkpoint(TRUNCATE)");
      fs.copyFileSync(dbPath, backupPath);
    }
  }

  db.exec(`
    DELETE FROM habits;
    DELETE FROM meta WHERE key = 'demo_seeded';
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '2');
  `);
}

function seedDefaultHabits(db: Database.Database) {
  const defaults: HabitInput[] = [
    {
      name: "早睡",
      category: "sleep",
      target: 22 * 60 + 30,
      unit: "time",
      color: "#4e79a7",
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
      color: "#f28e2b",
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
}

function seedDemoRecords(db: Database.Database) {
  const seeded = db
    .prepare("SELECT value FROM meta WHERE key = 'demo_seeded'")
    .get() as { value: string } | undefined;
  if (seeded) return;

  const habits = db
    .prepare("SELECT id, name, target, unit FROM habits ORDER BY sort_order")
    .all() as Pick<Habit, "id" | "name" | "target" | "unit">[];

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const todayDay = now.getDate();
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

export function createHabit(input: HabitInput) {
  const db = getDatabase();
  const row = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS nextOrder FROM habits")
    .get() as { nextOrder: number };
  const habit: Habit = {
    id: randomUUID(),
    name: input.name.trim(),
    category: input.category,
    target: input.target,
    unit: input.unit as HabitUnit,
    color: input.color,
    sortOrder: row.nextOrder + 1,
  };

  db.prepare(`
    INSERT INTO habits (id, name, category, target, unit, color, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    habit.id,
    habit.name,
    habit.category,
    habit.target,
    habit.unit,
    habit.color,
    habit.sortOrder,
  );

  return habit;
}

export function updateHabit(
  id: string,
  input: Partial<HabitInput>,
): Habit | null {
  const db = getDatabase();
  const current = db
    .prepare("SELECT * FROM habits WHERE id = ?")
    .get(id) as Habit | undefined;
  if (!current) return null;

  const next: Habit = {
    ...current,
    ...input,
    name: (input.name ?? current.name).trim(),
  };

  db.prepare(`
    UPDATE habits
    SET name = ?, category = ?, target = ?, unit = ?, color = ?
    WHERE id = ?
  `).run(
    next.name,
    next.category,
    next.target,
    next.unit,
    next.color,
    id,
  );

  return next;
}

export function deleteHabit(id: string) {
  const db = getDatabase();
  db.prepare("DELETE FROM habits WHERE id = ?").run(id);
}

export function upsertRecord(
  habitId: string,
  date: string,
  value: number,
  completed: boolean,
  note?: string,
) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO records (habit_id, date, value, completed, note)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(habit_id, date) DO UPDATE SET
      value = excluded.value,
      completed = excluded.completed,
      note = COALESCE(excluded.note, records.note),
      updated_at = datetime('now')
  `).run(habitId, date, value, completed ? 1 : 0, note ?? null);
}

export function deleteRecordsForMonth(month: string) {
  const db = getDatabase();
  const result = db
    .prepare("DELETE FROM records WHERE date LIKE ?")
    .run(`${month}-%`);
  return result.changes;
}
