// Run with `node --test scripts/check-project-gantt.cjs`. All database writes use a temporary database.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'habit-gantt-check-'));
process.env.DATABASE_PATH = path.join(temp, 'test.db');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);

// Simulate an older database where a project was shorter than one of its tasks.
const seed = new Database(process.env.DATABASE_PATH);
seed.exec(`
  CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, start_date TEXT, end_date TEXT, color TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE project_tasks (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, parent_id TEXT REFERENCES project_tasks(id) ON DELETE CASCADE, name TEXT, start_date TEXT, end_date TEXT, progress REAL, color TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
  INSERT INTO projects (id, name, start_date, end_date, color) VALUES ('legacy-project', '历史项目', '2026-10-05', '2026-10-10', '#4f7cff');
  INSERT INTO project_tasks (id, project_id, name, start_date, end_date, progress, color) VALUES ('legacy-task', 'legacy-project', '历史任务', '2026-09-01', '2026-11-01', 0, '#4f7cff');
`);
seed.close();
const model = require(path.join(root, 'lib/project-gantt-model.ts'));
const projects = require(path.join(root, 'lib/projects.ts'));
const db = require(path.join(root, 'lib/db.ts')).getDatabase();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
const createProject = () => projects.createProject({ name: '测试项目', startDate: '2026-10-01', endDate: '2026-10-10', color: '#4f7cff' });
const createTask = (projectId, dates = {}, parentId = null) => projects.createProjectTask({ projectId, parentId, name: '测试任务', startDate: '2026-10-02', endDate: '2026-10-05', progress: 0, color: '#4f7cff', ...dates });

test('default timeline starts seven days before the first, including year and leap boundaries', () => {
  assert.equal(model.getInitialViewStart('2026-10-19'), '2026-09-24');
  assert.equal(model.getInitialViewStart('2027-01-15'), '2026-12-25');
  assert.equal(model.getInitialViewStart('2024-03-05'), '2024-02-23');
  assert.equal(model.getInitialViewStart('2025-03-05'), '2025-02-22');
});
test('move preserves inclusive duration; resizing respects task and project boundaries', () => {
  const range = { startDate: '2026-12-29', endDate: '2027-01-03' };
  assert.deepEqual(model.dragDates(range, 'move', 5), { startDate: '2027-01-03', endDate: '2027-01-08' });
  assert.equal(model.dragDates(range, 'start', 20).startDate, range.endDate);
  assert.equal(model.dragDates(range, 'end', -20).endDate, range.startDate);
  const bounds = { startDate: '2026-12-30', endDate: '2027-01-02' };
  assert.equal(model.dragDates(range, 'start', 20, bounds).startDate, bounds.startDate);
  assert.equal(model.dragDates(range, 'end', -20, bounds).endDate, bounds.endDate);
});
test('clipped bars identify artificial edges and offscreen tasks identify direction', () => {
  const clipped = model.barGeometry({ startDate: '2026-09-01', endDate: '2026-10-12' }, '2026-09-24');
  assert.equal(clipped.clippedStart, true); assert.equal(clipped.clippedEnd, false); assert.equal(clipped.start, 0);
  assert.equal(model.barGeometry({ startDate: '2026-09-01', endDate: '2026-09-10' }, '2026-09-24').outside, 'before');
  assert.equal(model.barGeometry({ startDate: '2027-01-01', endDate: '2027-01-10' }, '2026-09-24').outside, 'after');
});
test('old project dates are repaired on database initialization and remain repaired', () => {
  assert.equal(projects.getProjectById('legacy-project').startDate, '2026-09-01');
  assert.equal(projects.getProjectById('legacy-project').endDate, '2026-11-01');
  assert.equal(projects.getProjectsData().projects[0].endDate, '2026-11-01');
});
test('new and edited child tasks expand projects; manual project edits cannot exclude tasks', () => {
  const project = createProject();
  const parent = createTask(project.id);
  const child = createTask(project.id, { startDate: '2026-09-20', endDate: '2026-11-02' }, parent.id);
  assert.equal(projects.getProjectById(project.id).startDate, child.startDate);
  assert.equal(projects.getProjectById(project.id).endDate, child.endDate);
  assert.equal(projects.updateProjectTask(child.id, { endDate: '2026-11-20' }), true);
  projects.updateProject(project.id, { startDate: '2026-10-01', endDate: '2026-10-03' });
  assert.equal(projects.getProjectById(project.id).startDate, '2026-09-20');
  assert.equal(projects.getProjectById(project.id).endDate, '2026-11-20');
});
test('undo restores both task dates and automatic project extension', () => {
  const project = createProject(); const task = createTask(project.id);
  projects.updateProjectTask(task.id, { endDate: '2026-11-20' });
  assert.equal(projects.getProjectById(project.id).endDate, '2026-11-20');
  projects.updateProjectTask(task.id, { startDate: task.startDate, endDate: task.endDate, projectDates: { startDate: project.startDate, endDate: project.endDate } });
  assert.equal(projects.getProjectTaskById(task.id).endDate, task.endDate);
  assert.equal(projects.getProjectById(project.id).endDate, project.endDate);
});
test('undo never truncates another task and failed project writes roll back the task', () => {
  const project = createProject(); const task = createTask(project.id);
  projects.updateProjectTask(task.id, { endDate: '2026-11-20' });
  createTask(project.id, { endDate: '2026-12-01' });
  projects.updateProjectTask(task.id, { endDate: task.endDate, projectDates: { startDate: project.startDate, endDate: project.endDate } });
  assert.equal(projects.getProjectById(project.id).endDate, '2026-12-01');
  db.exec("CREATE TRIGGER reject_project_update BEFORE UPDATE ON projects BEGIN SELECT RAISE(ABORT, 'expected failure'); END");
  try {
    assert.throws(() => projects.updateProjectTask(task.id, { endDate: '2027-01-01' }), /expected failure/);
    assert.equal(projects.getProjectTaskById(task.id).endDate, task.endDate);
  } finally { db.exec('DROP TRIGGER reject_project_update'); }
});
test('project preview includes drafts; progress counts leaves once; completed tasks are never overdue', () => {
  const project = createProject(); const task = createTask(project.id, { progress: 20 });
  createTask(project.id, { progress: 100 }, task.id); createTask(project.id, { progress: 0 }, task.id);
  const tree = projects.getProjectsData().projects.find((item) => item.id === project.id);
  assert.deepEqual(model.projectSummary(tree), { total: 2, completed: 1, progress: 50 });
  assert.equal(model.matchesTask(tree.tasks[0].children[0], 'overdue', '2026-12-01'), false);
  assert.equal(model.projectRange(tree, { [task.id]: { startDate: '2026-09-01', endDate: '2027-01-01' } }).endDate, '2027-01-01');
});
