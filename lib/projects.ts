import { randomUUID } from "node:crypto";
import { getDatabase } from "./db";
import type {
  Project,
  ProjectInput,
  ProjectsData,
  ProjectTask,
  ProjectTaskInput,
} from "./project-types";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: string, amount: number) {
  const next = parseDate(date);
  next.setDate(next.getDate() + amount);
  return formatDate(next);
}

function diffDays(start: string, end: string) {
  const startTime = parseDate(start).getTime();
  const endTime = parseDate(end).getTime();
  return Math.round((endTime - startTime) / 86400000);
}

export function isValidProjectDate(
  value: string | undefined,
): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseDate(value);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() === Number(value.slice(5, 7)) - 1 &&
    date.getDate() === Number(value.slice(8, 10))
  );
}

export function isValidProgress(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

export function isValidColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

type TaskRow = Omit<ProjectTask, "children">;

function getNextSortOrder(table:
  | "projects"
  | "project_tasks",
  projectId?: string,
) {
  const db = getDatabase();
  const row = projectId
    ? (db
        .prepare(
          `SELECT COALESCE(MAX(sort_order), 0) AS value FROM ${table} WHERE project_id = ?`,
        )
        .get(projectId) as { value: number })
    : (db
        .prepare(
          `SELECT COALESCE(MAX(sort_order), 0) AS value FROM ${table}`,
        )
        .get() as { value: number });
  return row.value + 1;
}

function validateDateRange(startDate: string, endDate: string) {
  if (!isValidProjectDate(startDate) || !isValidProjectDate(endDate)) {
    return false;
  }
  return diffDays(startDate, endDate) >= 0;
}

function extendProjectToIncludeTask(
  projectId: string,
  startDate: string,
  endDate: string,
) {
  getDatabase()
    .prepare(`
      UPDATE projects
      SET
        start_date = CASE WHEN start_date > ? THEN ? ELSE start_date END,
        end_date = CASE WHEN end_date < ? THEN ? ELSE end_date END
      WHERE id = ?
    `)
    .run(startDate, startDate, endDate, endDate, projectId);
}

export function getProjectsData(): ProjectsData {
  const db = getDatabase();

  const projectRows = db
    .prepare(`
      SELECT
        id,
        name,
        start_date AS startDate,
        end_date AS endDate,
        color,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM projects
      ORDER BY sort_order, created_at
    `)
    .all() as Array<Omit<Project, "tasks">>;

  const taskRows = db
    .prepare(`
      SELECT
        id,
        project_id AS projectId,
        parent_id AS parentId,
        name,
        start_date AS startDate,
        end_date AS endDate,
        progress,
        color,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM project_tasks
      ORDER BY sort_order, created_at
    `)
    .all() as TaskRow[];

  const projects: Project[] = projectRows.map((project) => ({
    ...project,
    tasks: [],
  }));
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const childMap = new Map<string, ProjectTask[]>();
  const directTasks: ProjectTask[] = [];

  taskRows.forEach((row) => {
    const task: ProjectTask = { ...row, children: [] };
    if (!projectMap.has(task.projectId)) return;
    if (task.parentId) {
      const list = childMap.get(task.parentId) ?? [];
      list.push(task);
      childMap.set(task.parentId, list);
    } else {
      directTasks.push(task);
    }
  });

  projectMap.forEach((project) => {
    project.tasks = directTasks
      .filter((task) => task.projectId === project.id)
      .map((task) => ({
        ...task,
        children: childMap.get(task.id) ?? [],
      }));
  });

  const today = formatDate(new Date());
  const allDates = projects.flatMap((project) => [
    project.startDate,
    project.endDate,
    ...project.tasks.flatMap((task) => [
      task.startDate,
      task.endDate,
      ...task.children.flatMap((child) => [child.startDate, child.endDate]),
    ]),
  ]);
  const initialStart = allDates.length > 0 ? allDates[0] : addDays(today, -7);
  const initialEnd =
    allDates.length > 0 ? allDates[0] : addDays(today, 14);
  const rangeStart = allDates.reduce(
    (current, date) => (date < current ? date : current),
    initialStart,
  );
  const rangeEnd = allDates.reduce(
    (current, date) => (date > current ? date : current),
    initialEnd,
  );
  const paddedStart = addDays(rangeStart, -7);
  const paddedEnd = addDays(rangeEnd, 7);

  return {
    projects,
    rangeStart: paddedStart,
    rangeEnd: paddedEnd,
    totalDays: diffDays(paddedStart, paddedEnd) + 1,
  };
}

export function getProjectById(id: string) {
  const db = getDatabase();
  return db
    .prepare(`
      SELECT
        id,
        name,
        start_date AS startDate,
        end_date AS endDate,
        color,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM projects
      WHERE id = ?
    `)
    .get(id) as Omit<Project, "tasks"> | undefined;
}

export function createProject(input: ProjectInput) {
  if (!validateDateRange(input.startDate, input.endDate)) return null;
  const db = getDatabase();
  const project: Project = {
    id: randomUUID(),
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    color: input.color,
    sortOrder: getNextSortOrder("projects"),
    createdAt: new Date().toISOString(),
    tasks: [],
  };
  db.prepare(`
    INSERT INTO projects
      (id, name, start_date, end_date, color, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    project.id,
    project.name,
    project.startDate,
    project.endDate,
    project.color,
    project.sortOrder,
  );
  return project;
}

export function updateProject(
  id: string,
  input: Partial<ProjectInput>,
) {
  const db = getDatabase();
  const current = getProjectById(id);
  if (!current) return false;
  const startDate = input.startDate ?? current.startDate;
  const endDate = input.endDate ?? current.endDate;
  if (!validateDateRange(startDate, endDate)) return false;

  const taskBounds = db
    .prepare(`
      SELECT MIN(start_date) AS startDate, MAX(end_date) AS endDate
      FROM project_tasks
      WHERE project_id = ?
    `)
    .get(id) as { startDate: string | null; endDate: string | null };
  const projectStartDate =
    taskBounds.startDate && taskBounds.startDate < startDate
      ? taskBounds.startDate
      : startDate;
  const projectEndDate =
    taskBounds.endDate && taskBounds.endDate > endDate
      ? taskBounds.endDate
      : endDate;

  db.prepare(`
    UPDATE projects
    SET name = ?, start_date = ?, end_date = ?, color = ?
    WHERE id = ?
  `).run(
    input.name?.trim() ?? current.name,
    projectStartDate,
    projectEndDate,
    input.color ?? current.color,
    id,
  );
  return true;
}

export function deleteProject(id: string) {
  const db = getDatabase();
  const result = db
    .prepare("DELETE FROM projects WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export function getProjectTaskById(id: string) {
  const db = getDatabase();
  return db
    .prepare(`
      SELECT
        id,
        project_id AS projectId,
        parent_id AS parentId,
        name,
        start_date AS startDate,
        end_date AS endDate,
        progress,
        color,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM project_tasks
      WHERE id = ?
    `)
    .get(id) as TaskRow | undefined;
}

function canUseParent(
  projectId: string,
  parentId: string | null,
  excludedTaskId?: string,
) {
  if (!parentId) return true;
  const parent = getProjectTaskById(parentId);
  return Boolean(
    parent &&
      parent.id !== excludedTaskId &&
      parent.projectId === projectId &&
      !parent.parentId,
  );
}

function hasChildTasks(taskId: string) {
  const db = getDatabase();
  return Boolean(
    db
      .prepare("SELECT 1 FROM project_tasks WHERE parent_id = ? LIMIT 1")
      .get(taskId),
  );
}

export function createProjectTask(input: ProjectTaskInput) {
  const db = getDatabase();
  const project = getProjectById(input.projectId);
  if (!project) return null;
  if (
    !validateDateRange(input.startDate, input.endDate) ||
    !canUseParent(input.projectId, input.parentId ?? null)
  ) {
    return null;
  }

  const task: ProjectTask = {
    id: randomUUID(),
    projectId: input.projectId,
    parentId: input.parentId ?? null,
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    progress: input.progress,
    color: input.color,
    sortOrder: getNextSortOrder("project_tasks", input.projectId),
    createdAt: new Date().toISOString(),
    children: [],
  };

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO project_tasks
        (id, project_id, parent_id, name, start_date, end_date, progress, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.projectId,
      task.parentId,
      task.name,
      task.startDate,
      task.endDate,
      task.progress,
      task.color,
      task.sortOrder,
    );
    extendProjectToIncludeTask(task.projectId, task.startDate, task.endDate);
  });
  transaction();
  return task;
}

export function updateProjectTask(
  id: string,
  input: Partial<
    Pick<
      ProjectTaskInput,
      "parentId" | "name" | "startDate" | "endDate" | "progress" | "color"
    >
  >,
) {
  const db = getDatabase();
  const current = getProjectTaskById(id);
  if (!current) return false;

  const parentId =
    input.parentId === undefined ? current.parentId : input.parentId;
  const startDate = input.startDate ?? current.startDate;
  const endDate = input.endDate ?? current.endDate;
  if (
    !validateDateRange(startDate, endDate) ||
    !canUseParent(current.projectId, parentId, id)
  ) {
    return false;
  }
  if (parentId && hasChildTasks(id)) {
    return false;
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE project_tasks
      SET
        parent_id = ?,
        name = ?,
        start_date = ?,
        end_date = ?,
        progress = ?,
        color = ?
      WHERE id = ?
    `).run(
      parentId,
      input.name?.trim() ?? current.name,
      startDate,
      endDate,
      input.progress ?? current.progress,
      input.color ?? current.color,
      id,
    );
    extendProjectToIncludeTask(current.projectId, startDate, endDate);
  });
  transaction();
  return true;
}

export function deleteProjectTask(id: string) {
  const db = getDatabase();
  const result = db
    .prepare("DELETE FROM project_tasks WHERE id = ?")
    .run(id);
  return result.changes > 0;
}
