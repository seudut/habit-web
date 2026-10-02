"use client";

import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, ProjectTask, ProjectsData } from "@/lib/project-types";
import {
  addDays, allTasks, barGeometry, clamp, diffDays, dragDates, formatDate,
  formatDateRange, formatShortDate, getInitialViewStart, getToday, isValidDateValue,
  leafTasks, matchesTask, parseDate, projectRange, projectSummary, taskBounds,
  taskStatus, TIMELINE_DAYS,
} from "@/lib/project-gantt-model";
import type { DateRange, DragSide, TaskFilter } from "@/lib/project-gantt-model";

const DEFAULT_COLOR = "#4f7cff";
const COLORS = ["#4f7cff", "#22a06b", "#f08c00", "#8c6bb1", "#e15759", "#59a14f", "#76b7b2"];
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
type ModalState = { mode: "project"; projectId?: string } | { mode: "task"; projectId: string; taskId?: string; parentId?: string };
interface ProjectFormState extends DateRange { name: string; color: string }
interface TaskFormState extends ProjectFormState { parentId: string; progress: string }
interface TaskCellDraft extends DateRange { duration: string }
interface UndoAction { url: string; body: Record<string, unknown>; label: string }
interface Mutation {
  url: string; method: "POST" | "PATCH" | "DELETE"; body?: object;
  undo?: UndoAction; preserveDraft?: boolean;
}
interface BarDrag {
  kind: "task" | "project"; id: string; project: Project; task?: ProjectTask;
  side: DragSide; pointerId: number; startX: number; original: DateRange;
  latest: DateRange; moved: boolean; dayWidth: number;
}
const ICON_PATHS = {
  plus: "M12 5v14M5 12h14", left: "m14 6-6 6 6 6", right: "m10 6 6 6-6 6",
  down: "m6 9 6 6 6-6", search: "m21 21-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16",
  calendar: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4", check: "m5 12 4 4L19 6",
  undo: "M4 10h10a6 6 0 0 1 0 12M4 10l5-5M4 10l5 5", close: "m6 6 12 12M6 18 18 6",
  columns: "M4 4h16v16H4zM10 4v16M16 4v16", collapse: "m7 4 5 5 5-5M7 20l5-5 5 5",
  expand: "m7 9 5-5 5 5M7 15l5 5 5-5", target: "M12 3v3M12 18v3M3 12h3M18 12h3M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12",
} as const;
function barTextColor(color: string) {
  const rgb = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.2 ? "#172033" : "#ffffff";
}
function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[name]} /></svg>;
}
async function responseError(response: Response) {
  try { const body = await response.json(); return body.error || "保存失败，请重试"; }
  catch { return "保存失败，请重试"; }
}

export function ProjectGantt({ initialData }: { initialData: ProjectsData }) {
  const [data, setData] = useState(initialData);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"loaded" | "saved" | "error">("loaded");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [failedAction, setFailedAction] = useState<Mutation | null>(null);
  const [lastUndo, setLastUndo] = useState<UndoAction | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskCellDraft>>({});
  const [projectDateDrafts, setProjectDateDrafts] = useState<Record<string, DateRange>>({});
  const [progressDrafts, setProgressDrafts] = useState<Record<string, string>>({});
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedTasks, setCollapsedTasks] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [compact, setCompact] = useState(false);
  const [scale, setScale] = useState<"day" | "week">("day");
  const [columns, setColumns] = useState({ dates: true, duration: true, progress: true });
  const [nameWidth, setNameWidth] = useState(280);
  const [viewStart, setViewStart] = useState(() => getInitialViewStart(getToday()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; range: DateRange; extended: boolean } | null>(null);
  const [menu, setMenu] = useState<{ project: Project; task?: ProjectTask; x: number; y: number } | null>(null);
  const busyRef = useRef(false);
  const dragRef = useRef<BarDrag | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; start: string } | null>(null);
  const resizeRef = useRef<{ x: number; width: number } | null>(null);
  const suppressClickRef = useRef<{ id: string; until: number } | null>(null);
  const skipBlurRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [projectForm, setProjectForm] = useState<ProjectFormState>({ name: "", startDate: getToday(), endDate: addDays(getToday(), 14), color: DEFAULT_COLOR });
  const [taskForm, setTaskForm] = useState<TaskFormState>({ name: "", parentId: "", startDate: getToday(), endDate: addDays(getToday(), 7), progress: "0", color: DEFAULT_COLOR });

  const today = getToday();
  const dayWidth = scale === "day" ? 32 : 12;
  const timelineWidth = TIMELINE_DAYS * dayWidth;
  const viewEnd = addDays(viewStart, TIMELINE_DAYS - 1);
  const gridColumns = `${nameWidth}px${columns.dates ? " 120px 120px" : ""}${columns.duration ? " 64px" : ""}${columns.progress ? " 86px" : ""}`;
  const metaWidth = nameWidth + (columns.dates ? 240 : 0) + (columns.duration ? 64 : 0) + (columns.progress ? 86 : 0);
  const locked = saving || Boolean(failedAction);
  const isFiltering = Boolean(query.trim()) || filter !== "all";
  const allCollapsed = data.projects.length > 0 && data.projects.every((project) => collapsedProjects[project.id]);
  const leaves = data.projects.flatMap(leafTasks);
  const overdueCount = leaves.filter((task) => matchesTask(task, "overdue", today)).length;
  const completedCount = leaves.filter((task) => task.progress === 100).length;
  const editingProject = modal?.mode === "project" ? data.projects.find((project) => project.id === modal.projectId) : undefined;
  const editingTask = modal?.mode === "task" ? findTask(data.projects, modal.taskId) : undefined;
  const activeProject = modal?.mode === "task" ? data.projects.find((project) => project.id === modal.projectId) : undefined;
  const parentOptions = activeProject?.tasks.filter((task) => task.id !== editingTask?.id) ?? [];
  const calendar = useMemo(() => {
    const days = Array.from({ length: TIMELINE_DAYS }, (_, index) => addDays(viewStart, index));
    const months: { key: string; label: string; count: number }[] = [];
    const weeks: { start: string; count: number }[] = [];
    for (const date of days) {
      const month = date.slice(0, 7);
      const last = months[months.length - 1];
      if (last?.key === month) last.count++;
      else months.push({ key: month, label: `${date.slice(0, 4)} 年 ${Number(date.slice(5, 7))} 月`, count: 1 });
      const week = weeks[weeks.length - 1];
      if (!week || parseDate(date).getDay() === 1) weeks.push({ start: date, count: 1 });
      else week.count++;
    }
    return { days, months, weeks };
  }, [viewStart]);
  const filteredProjects = data.projects.map((project) => {
    const projectMatch = project.name.toLowerCase().includes(query.trim().toLowerCase());
    const taskMatches = (task: ProjectTask) => matchesTask(task, filter, today) && (projectMatch || task.name.toLowerCase().includes(query.trim().toLowerCase()));
    const rows = project.tasks.flatMap((task) => {
      const ownMatch = taskMatches(task);
      const children = task.children.filter(taskMatches);
      if (isFiltering && !ownMatch && !children.length) return [];
      return [{ task, children: isFiltering ? children : task.children, context: isFiltering && !ownMatch }];
    });
    return { project, rows };
  }).filter(({ project, rows }) => !isFiltering || rows.length > 0 || (!project.tasks.length && filter === "all" && project.name.toLowerCase().includes(query.trim().toLowerCase())));

  useEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 1200px)");
    const adapt = () => {
      if (compactViewport.matches) {
        const small = window.innerWidth < 600;
        setColumns({ dates: false, duration: false, progress: !small });
        setNameWidth(small ? 220 : 240);
      }
    };
    adapt();
    compactViewport.addEventListener("change", adapt);
    return () => compactViewport.removeEventListener("change", adapt);
  }, []);

  useEffect(() => {
    function cancel(event: KeyboardEvent) {
      if (event.key !== "Escape" || !dragRef.current) return;
      const drag = dragRef.current;
      dragRef.current = null;
      suppressClickRef.current = { id: drag.id, until: Date.now() + 500 };
      if (drag.kind === "task") setTaskDrafts((current) => { const next = { ...current }; delete next[drag.id]; return next; });
      else setProjectDateDrafts((current) => { const next = { ...current }; delete next[drag.id]; return next; });
      setActiveDragId(null); setTooltip(null);
    }
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenu(null); menuTriggerRef.current?.focus({ preventScroll: true }); }
    };
    window.addEventListener("pointerdown", close); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", key); };
  }, [menu]);

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) setModal(null);
      if (event.key !== "Tab") return;
      const elements = Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? []);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", key); previous?.focus({ preventScroll: true }); };
  }, [modal]);

  function getTaskDraft(task: ProjectTask): TaskCellDraft {
    return taskDrafts[task.id] ?? { startDate: task.startDate, endDate: task.endDate, duration: String(diffDays(task.startDate, task.endDate) + 1) };
  }
  function getProjectDraft(project: Project) { return projectRange(project, taskDrafts, projectDateDrafts[project.id]); }
  function rejectTaskDraft(task: ProjectTask) { setTaskDrafts((current) => { const next = { ...current }; delete next[task.id]; return next; }); }
  function clearDrafts() { setTaskDrafts({}); setProjectDateDrafts({}); setProgressDrafts({}); }
  async function discardFailure() {
    if (busyRef.current) return;
    busyRef.current = true; setSaving(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const fresh = await response.json() as ProjectsData;
      setData(fresh); clearDrafts(); setFailedAction(null); setLastUndo(null);
      setNotice(""); setSaveState("loaded");
    } catch { setNotice("无法重新加载，请检查连接后重试。当前修改仍保留在页面中。"); }
    finally { busyRef.current = false; setSaving(false); }
  }
  async function mutate(action: Mutation) {
    if (busyRef.current) return false;
    busyRef.current = true; setSaving(true); setNotice(""); setFormError("");
    try {
      const response = await fetch(action.url, {
        method: action.method, headers: { "Content-Type": "application/json" },
        body: action.body ? JSON.stringify(action.body) : undefined,
      });
      if (!response.ok) throw new Error(await responseError(response));
      const result = await response.json() as { data: ProjectsData };
      if (!result.data?.projects) throw new Error("已收到保存响应，但未能更新视图，请重新加载页面");
      // Apply authoritative task and project dates together before removing the preview.
      setData(result.data); clearDrafts(); setFailedAction(null);
      setLastUndo(action.undo ?? null); setSaveState("saved");
      return true;
    } catch (error) {
      const message = error instanceof TypeError ? "网络连接失败，修改尚未确认保存" : error instanceof Error ? error.message : "保存失败，请重试";
      setNotice(message); setFormError(message); setSaveState("error");
      if (action.preserveDraft) setFailedAction(action);
      return false;
    } finally { busyRef.current = false; setSaving(false); }
  }
  function openNewProject() {
    setProjectForm({ name: "", startDate: today, endDate: addDays(today, 14), color: DEFAULT_COLOR });
    setFormError(""); setModal({ mode: "project" });
  }
  function openEditProject(project: Project) {
    setProjectForm({ name: project.name, ...getProjectDraft(project), color: project.color });
    setFormError(""); setModal({ mode: "project", projectId: project.id });
  }
  function openNewTask(project: Project, parentId?: string) {
    const parent = findTask([project], parentId);
    const range = parent ?? getProjectDraft(project);
    setTaskForm({ name: "", parentId: parentId ?? "", startDate: range.startDate, endDate: range.endDate, progress: "0", color: parent?.color ?? project.color });
    setFormError(""); setModal({ mode: "task", projectId: project.id, parentId });
  }
  function openEditTask(project: Project, task: ProjectTask) {
    setTaskForm({ name: task.name, parentId: task.parentId ?? "", startDate: task.startDate, endDate: task.endDate, progress: String(task.progress), color: task.color });
    setFormError(""); setModal({ mode: "task", projectId: project.id, taskId: task.id });
  }
  function closeModal() { if (!busyRef.current) { setModal(null); setFormError(""); } }
  async function handleSaveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await mutate({ url: editingProject ? `/api/projects/${editingProject.id}` : "/api/projects", method: editingProject ? "PATCH" : "POST", body: projectForm })) setModal(null);
  }
  async function handleSaveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!activeProject) return;
    if (await mutate({ url: editingTask ? `/api/projects/tasks/${editingTask.id}` : "/api/projects/tasks", method: editingTask ? "PATCH" : "POST", body: { ...taskForm, parentId: taskForm.parentId || null, projectId: activeProject.id, progress: Number(taskForm.progress || 0) } })) setModal(null);
  }
  async function handleDeleteProject(project: Project) {
    if (window.confirm(`删除项目“${project.name}”及其下所有任务？`)) await mutate({ url: `/api/projects/${project.id}`, method: "DELETE" });
  }
  async function handleDeleteTask(task: ProjectTask) {
    if (window.confirm(`删除任务“${task.name}”${task.children.length ? "及其子任务" : ""}？`)) await mutate({ url: `/api/projects/tasks/${task.id}`, method: "DELETE" });
  }
  async function saveTaskDates(project: Project, task: ProjectTask, range: DateRange) {
    if (!isValidDateValue(range.startDate) || !isValidDateValue(range.endDate) || range.endDate < range.startDate) { setNotice("请输入有效的日期，结束日期不能早于开始日期"); return; }
    if (range.startDate === task.startDate && range.endDate === task.endDate) { rejectTaskDraft(task); return; }
    await mutate({ url: `/api/projects/tasks/${task.id}`, method: "PATCH", body: range, preserveDraft: true,
      undo: { url: `/api/projects/tasks/${task.id}`, label: task.name, body: { startDate: task.startDate, endDate: task.endDate, projectDates: { startDate: project.startDate, endDate: project.endDate } } },
    });
  }
  async function saveProjectDates(project: Project, range: DateRange) {
    if (range.startDate === project.startDate && range.endDate === project.endDate) { setProjectDateDrafts({}); return; }
    await mutate({ url: `/api/projects/${project.id}`, method: "PATCH", body: range, preserveDraft: true,
      undo: { url: `/api/projects/${project.id}`, label: project.name, body: { startDate: project.startDate, endDate: project.endDate } },
    });
  }

  function navigate(start: string) {
    setViewStart(start);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }
  function shiftMonth(delta: number) {
    const date = parseDate(addDays(viewStart, 7));
    navigate(addDays(formatDate(new Date(date.getFullYear(), date.getMonth() + delta, 1)), -7));
  }
  function locate(range: DateRange, id: string) { navigate(addDays(range.startDate, -3)); setSelectedId(id); }
  function changeScale(next: "day" | "week") {
    const day = (scrollRef.current?.scrollLeft ?? 0) / dayWidth;
    setScale(next);
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollLeft = day * (next === "day" ? 32 : 12); });
  }
  function startDrag(project: Project, task: ProjectTask | undefined, event: ReactPointerEvent<HTMLElement>) {
    if (locked || busyRef.current || event.button !== 0 || !(event.target instanceof Element)) return;
    if (document.activeElement instanceof HTMLInputElement) {
      document.activeElement.blur();
      if (busyRef.current) return;
    }
    if (Object.keys(taskDrafts).some((id) => id !== task?.id) || Object.keys(progressDrafts).length) {
      setNotice("请先完成当前单元格编辑，或按 Esc 取消"); return;
    }
    const side: DragSide = event.target.closest('[data-grip="start"]') ? "start" : event.target.closest('[data-grip="end"]') ? "end" : "move";
    setSelectedId(task?.id ?? project.id);
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    if (!task && side === "move") return;
    const original = task ? getTaskDraft(task) : getProjectDraft(project);
    dragRef.current = { kind: task ? "task" : "project", id: task?.id ?? project.id, project, task, side, pointerId: event.pointerId, startX: event.clientX, original, latest: original, moved: false, dayWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveDragId(task?.id ?? project.id);
  }
  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(distance) < 5) return;
    drag.moved = true;
    drag.latest = dragDates(drag.original, drag.side, Math.round(distance / drag.dayWidth), drag.kind === "project" ? taskBounds(drag.project) : null);
    if (drag.kind === "task") {
      setTaskDrafts((current) => ({ ...current, [drag.id]: { ...drag.latest, duration: String(diffDays(drag.latest.startDate, drag.latest.endDate) + 1) } }));
    } else setProjectDateDrafts((current) => ({ ...current, [drag.id]: drag.latest }));
    setTooltip({ x: clamp(event.clientX, 150, window.innerWidth - 150), y: Math.max(12, event.clientY - 78), range: drag.latest,
      extended: drag.kind === "task" && (drag.latest.startDate < drag.project.startDate || drag.latest.endDate > drag.project.endDate) });
  }
  function endDrag(event: ReactPointerEvent<HTMLElement>, cancel = false) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null; setActiveDragId(null); setTooltip(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.moved) return;
    suppressClickRef.current = { id: drag.id, until: Date.now() + 500 };
    if (cancel) {
      if (drag.task) rejectTaskDraft(drag.task);
      else setProjectDateDrafts({});
      return;
    }
    if (drag.task) void saveTaskDates(drag.project, drag.task, drag.latest);
    else void saveProjectDates(drag.project, drag.latest);
  }
  function barClick(id: string) {
    if (suppressClickRef.current?.id === id && suppressClickRef.current.until > Date.now()) return;
    setSelectedId(id);
  }
  function openMenu(project: Project, task: ProjectTask | undefined, button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    menuTriggerRef.current = button;
    setMenu({ project, task, x: Math.min(rect.left, window.innerWidth - 200), y: Math.min(rect.bottom + 6, window.innerHeight - 190) });
  }
  function inputKey(event: ReactKeyboardEvent<HTMLInputElement>, task: ProjectTask) {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      skipBlurRef.current = task.id; rejectTaskDraft(task);
      setProgressDrafts((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setNotice(""); event.currentTarget.blur();
    }
  }
  function skipBlur(task: ProjectTask) {
    if (skipBlurRef.current !== task.id) return false;
    skipBlurRef.current = null; return true;
  }
  function changeDates(task: ProjectTask, field: "startDate" | "endDate" | "duration", value: string) {
    const current = getTaskDraft(task);
    const next = { ...current, [field]: value };
    if (field === "startDate" && isValidDateValue(value) && Number.isInteger(Number(current.duration)) && Number(current.duration) > 0) next.endDate = addDays(value, Number(current.duration) - 1);
    if (field === "endDate" && isValidDateValue(value)) next.duration = String(diffDays(current.startDate, value) + 1);
    if (field === "duration" && Number.isInteger(Number(value)) && Number(value) > 0 && isValidDateValue(current.startDate)) next.endDate = addDays(current.startDate, Number(value) - 1);
    setTaskDrafts((drafts) => ({ ...drafts, [task.id]: next }));
  }
  function commitDates(project: Project, task: ProjectTask) {
    if (skipBlur(task) || busyRef.current) return;
    const draft = getTaskDraft(task);
    if (!Number.isInteger(Number(draft.duration)) || Number(draft.duration) < 1) { setNotice("工期应为至少 1 天的整数"); return; }
    void saveTaskDates(project, task, { startDate: draft.startDate, endDate: draft.endDate });
  }
  function commitProgress(task: ProjectTask) {
    if (skipBlur(task) || busyRef.current) return;
    const text = progressDrafts[task.id];
    if (text === undefined) return;
    const value = Number(text);
    if (!text.trim() || !Number.isFinite(value) || value < 0 || value > 100) { setNotice("进度应为 0 到 100 之间的数字"); return; }
    if (value === task.progress) { setProgressDrafts((current) => { const next = { ...current }; delete next[task.id]; return next; }); return; }
    void mutate({ url: `/api/projects/tasks/${task.id}`, method: "PATCH", body: { progress: value }, preserveDraft: true });
  }
  function renderBackground() {
    const todayIndex = diffDays(viewStart, today);
    return <div className="gantt-track-background" aria-hidden="true">
      {calendar.days.map((date, index) => {
        const weekday = parseDate(date).getDay();
        return (weekday === 0 || weekday === 6 || weekday === 1) ? <span key={date} className={weekday === 1 ? "gantt-week-divider" : "gantt-weekend"} style={{ left: index * dayWidth, width: weekday === 1 ? 1 : dayWidth }} /> : null;
      })}
      {todayIndex >= 0 && todayIndex < TIMELINE_DAYS && <span className="gantt-today-line" style={{ left: todayIndex * dayWidth + dayWidth / 2 }} />}
    </div>;
  }
  function renderBar(project: Project, task?: ProjectTask) {
    const draft = task ? getTaskDraft(task) : getProjectDraft(project);
    const range = isValidDateValue(draft.startDate) && isValidDateValue(draft.endDate) && draft.endDate >= draft.startDate ? draft : task ?? project;
    const geometry = barGeometry(range, viewStart);
    const id = task?.id ?? project.id;
    const color = task?.color ?? project.color;
    if (geometry.outside) return <button className="gantt-outside" onClick={() => locate(range, id)} title={`${formatDateRange(range.startDate, range.endDate)}，点击定位`}>
      <Icon name={geometry.outside === "before" ? "left" : "right"} />{geometry.outside === "before" ? "在范围之前" : "在范围之后"}<span>定位</span>
    </button>;
    const allowResize = geometry.length * dayWidth >= 24;
    return <button
      type="button" aria-label={`${task?.name ?? project.name} 时间条`}
      className={`gantt-bar ${task ? "is-task" : "is-project"}${task?.progress === 100 ? " is-complete" : ""}${selectedId === id ? " is-selected" : ""}${activeDragId === id ? " is-dragging" : ""}${geometry.clippedStart ? " clipped-start" : ""}${geometry.clippedEnd ? " clipped-end" : ""}`}
      style={{ left: geometry.start * dayWidth, width: geometry.length * dayWidth, "--accent": color, "--bar-text": barTextColor(color) } as CSSProperties}
      disabled={locked}
      onPointerDown={(event) => startDrag(project, task, event)} onPointerMove={moveDrag} onPointerUp={(event) => endDrag(event)}
      onPointerCancel={(event) => endDrag(event, true)} onLostPointerCapture={(event) => endDrag(event, true)}
      onClick={() => barClick(id)} onDoubleClick={() => task ? openEditTask(project, task) : openEditProject(project)}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); task ? openEditTask(project, task) : openEditProject(project); } }}
      title={`${task?.name ?? project.name} · ${formatDateRange(range.startDate, range.endDate)} · ${diffDays(range.startDate, range.endDate) + 1} 天${task ? ` · ${task.progress}% · 拖动中间平移，双击编辑` : " · 项目汇总区间"}`}
    >
      {task && <span className="gantt-bar-progress" style={{ width: `${task.progress}%` }} />}
      <span className="gantt-bar-text">{geometry.clippedStart ? "‹ " : ""}{task?.progress === 100 ? "✓ " : ""}{task?.name ?? project.name}{geometry.clippedEnd ? " ›" : ""}</span>
      {allowResize && !geometry.clippedStart && <span className="gantt-grip start" data-grip="start" aria-hidden="true" />}
      {allowResize && !geometry.clippedEnd && <span className="gantt-grip end" data-grip="end" aria-hidden="true" />}
    </button>;
  }
  function renderTaskRow(project: Project, task: ProjectTask, child = false, context = false) {
    const draft = getTaskDraft(task);
    const status = taskStatus(task, today);
    return <div className={`gantt-row task-row${child ? " child-row" : ""}${selectedId === task.id ? " selected" : ""}${context ? " context-row" : ""}`} key={task.id} data-task-id={task.id}>
      <div className="gantt-meta" style={{ gridTemplateColumns: gridColumns }}>
        <div className="gantt-name-cell">
          {task.children.length ? <button className="gantt-icon-button gantt-disclosure" disabled={isFiltering} aria-label={`${collapsedTasks[task.id] ? "展开" : "收起"} ${task.name} 的子任务`} aria-expanded={isFiltering || !collapsedTasks[task.id]} onClick={() => setCollapsedTasks((current) => ({ ...current, [task.id]: !current[task.id] }))}><Icon name={isFiltering || !collapsedTasks[task.id] ? "down" : "right"} /></button> : <span className="gantt-tree-spacer">{child ? "└" : ""}</span>}
          <span className="gantt-dot" style={{ backgroundColor: task.color }} />
          <button className="gantt-name" onClick={() => openEditTask(project, task)} disabled={locked} title={task.name}>{task.name}</button>
          <span className={`gantt-task-status ${status.kind}`} title={status.label}>{status.kind === "completed" ? <Icon name="check" /> : status.kind === "overdue" ? "逾期" : null}</span>
          <button className="gantt-icon-button gantt-more" aria-label={`${task.name} 更多操作`} disabled={locked} onClick={(event) => openMenu(project, task, event.currentTarget)}>···</button>
        </div>
        {columns.dates && (["startDate", "endDate"] as const).map((field) => <div className="gantt-cell" key={field}>
          <input className="gantt-cell-input" type="date" aria-label={`${task.name} ${field === "startDate" ? "开始日期" : "结束日期"}`} value={draft[field]} disabled={locked} onChange={(event) => changeDates(task, field, event.target.value)} onKeyDown={(event) => inputKey(event, task)} onBlur={() => commitDates(project, task)} />
        </div>)}
        {columns.duration && <div className="gantt-cell"><input className="gantt-cell-input gantt-number" type="number" min="1" step="1" aria-label={`${task.name} 工期（天）`} value={draft.duration} disabled={locked} onChange={(event) => changeDates(task, "duration", event.target.value)} onKeyDown={(event) => inputKey(event, task)} onBlur={() => commitDates(project, task)} /></div>}
        {columns.progress && <div className="gantt-cell gantt-progress-cell"><input className="gantt-cell-input gantt-number" type="number" min="0" max="100" step="1" aria-label={`${task.name} 进度`} value={progressDrafts[task.id] ?? String(task.progress)} disabled={locked} onChange={(event) => setProgressDrafts((current) => ({ ...current, [task.id]: event.target.value }))} onKeyDown={(event) => inputKey(event, task)} onBlur={() => commitProgress(task)} /><span>%</span></div>}
      </div>
      <div className="gantt-track">{renderBackground()}{renderBar(project, task)}</div>
    </div>;
  }

  return (
    <section className={`gantt${compact ? " compact" : ""}${activeDragId ? " dragging" : ""}`} style={{ "--meta-width": `${metaWidth}px`, "--timeline-width": `${timelineWidth}px`, "--day-width": `${dayWidth}px` } as CSSProperties}>
      <header className="gantt-heading">
        <div><h1>项目甘特图</h1><p>把计划放到时间线上，让每一步都有安排。</p></div>
        <div className="gantt-heading-actions">
          <span className={`gantt-save-status ${saving ? "saving" : saveState}`} role="status" aria-live="polite"><span />{saving ? "保存中…" : failedAction || saveState === "error" ? "保存未完成" : Object.keys(taskDrafts).length || Object.keys(progressDrafts).length ? "有未保存的修改" : saveState === "saved" ? "已保存" : "已加载"}</span>
          <button className="gantt-button" disabled={!lastUndo || locked} title={lastUndo ? `撤销 ${lastUndo.label} 的日期调整` : "可撤销最近一次日期调整"} onClick={() => lastUndo && void mutate({ url: lastUndo.url, method: "PATCH", body: lastUndo.body, preserveDraft: true })}><Icon name="undo" />撤销</button>
          <button className="primary-button gantt-add-project" disabled={locked} onClick={openNewProject}><Icon name="plus" />新增项目</button>
        </div>
      </header>
      <div className="gantt-overview">
        <span><strong>{data.projects.length}</strong> 个项目</span><span className="gantt-overview-divider" />
        <span title="只统计没有子任务的任务，避免父子重复计算"><strong>{leaves.length}</strong> 项任务</span>
        <button onClick={() => setFilter("completed")}><span className="gantt-status-dot completed" />已完成 <strong>{completedCount}</strong></button>
        <button className={overdueCount ? "has-overdue" : ""} onClick={() => setFilter("overdue")}><span className="gantt-status-dot overdue" />逾期 <strong>{overdueCount}</strong></button>
      </div>
      {notice && <div className={`gantt-notice${saveState === "error" ? " error" : ""}`} role="alert"><span>{notice}</span>{failedAction && <><button disabled={saving} onClick={() => void mutate(failedAction)}>重试保存</button><button disabled={saving} onClick={() => void discardFailure()}>重新加载</button></>}{!failedAction && <button className="gantt-icon-button" aria-label="关闭提示" onClick={() => setNotice("")}><Icon name="close" /></button>}</div>}
      <div className="gantt-card">
        <div className="gantt-toolbar">
          <label className="gantt-search"><Icon name="search" /><input type="search" placeholder="搜索项目或任务…" aria-label="搜索项目或任务" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="gantt-filters" aria-label="任务状态筛选">{([['all', '全部'], ['unfinished', '未完成'], ['overdue', '逾期'], ['completed', '已完成']] as const).map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
          <div className="gantt-toolbar-spacer" />
          <button className="gantt-button" aria-pressed={compact} onClick={() => setCompact((current) => !current)}>{compact ? "紧凑行高" : "舒适行高"}</button>
          <details className="gantt-column-options"><summary className="gantt-button"><Icon name="columns" />列显示</summary><div>{([['dates', '开始 / 结束日期'], ['duration', '工期'], ['progress', '进度']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={columns[key]} onChange={(event) => setColumns((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div></details>
        </div>
        <div className="gantt-navigation">
          <div className="gantt-nav-controls"><button className="gantt-icon-button" aria-label="上一月" title="上一月" onClick={() => shiftMonth(-1)}><Icon name="left" /></button><button className="gantt-icon-button" aria-label="下一月" title="下一月" onClick={() => shiftMonth(1)}><Icon name="right" /></button><span className="gantt-visible-range"><Icon name="calendar" />{formatDateRange(viewStart, viewEnd)}</span><button className="gantt-button" onClick={() => navigate(getInitialViewStart(today))}>本月</button><button className="gantt-button" onClick={() => navigate(addDays(today, -7))}>今天</button></div>
          <div className="gantt-view-controls"><button className="gantt-button" disabled={isFiltering} onClick={() => { setCollapsedProjects(Object.fromEntries(data.projects.map((project) => [project.id, !allCollapsed]))); setCollapsedTasks(Object.fromEntries(data.projects.flatMap(allTasks).map((task) => [task.id, !allCollapsed]))); }}><Icon name={allCollapsed ? "expand" : "collapse"} />{allCollapsed ? "全部展开" : "全部收起"}</button><div className="gantt-scale" aria-label="时间刻度"><button aria-pressed={scale === "day"} className={scale === "day" ? "active" : ""} onClick={() => changeScale("day")}>日</button><button aria-pressed={scale === "week"} className={scale === "week" ? "active" : ""} onClick={() => changeScale("week")}>周</button></div></div>
        </div>
        {data.projects.length === 0 ? <div className="gantt-empty"><Icon name="calendar" /><h2>从第一个项目开始</h2><p>创建项目，添加任务，然后在时间线上安排它们。</p><button className="primary-button" disabled={locked} onClick={openNewProject}>新增项目</button></div> : <>
          <div className="gantt-scroll" ref={scrollRef} aria-label="项目甘特图，可横向滚动" tabIndex={0}>
            <div className="gantt-canvas">
              <div className="gantt-calendar-header">
                <div className="gantt-meta" style={{ gridTemplateColumns: gridColumns }}>
                  <div className="gantt-name-header">项目 / 任务<span className="gantt-column-resizer" role="separator" aria-label="调整名称列宽度" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={420} aria-valuenow={nameWidth} tabIndex={0}
                    onPointerDown={(event) => { event.preventDefault(); resizeRef.current = { x: event.clientX, width: nameWidth }; event.currentTarget.setPointerCapture(event.pointerId); }}
                    onPointerMove={(event) => { if (resizeRef.current) setNameWidth(clamp(resizeRef.current.width + event.clientX - resizeRef.current.x, 220, 420)); }}
                    onPointerUp={() => { resizeRef.current = null; }} onPointerCancel={() => { resizeRef.current = null; }}
                    onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setNameWidth((width) => clamp(width + (event.key === "ArrowLeft" ? -20 : 20), 220, 420)); } }} /></div>
                  {columns.dates && <><div className="gantt-cell">开始日期</div><div className="gantt-cell">结束日期</div></>}{columns.duration && <div className="gantt-cell">工期 / 天</div>}{columns.progress && <div className="gantt-cell">进度</div>}
                </div>
                <div className="gantt-calendar" title="拖动日期刻度可平移时间轴" onPointerDown={(event) => { if (event.button !== 0) return; panRef.current = { pointerId: event.pointerId, x: event.clientX, start: viewStart }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const pan = panRef.current; if (pan?.pointerId === event.pointerId) setViewStart(addDays(pan.start, Math.round((pan.x - event.clientX) / dayWidth))); }} onPointerUp={() => { panRef.current = null; }} onPointerCancel={() => { panRef.current = null; }}>
                  <div className="gantt-months">{calendar.months.map((month) => <div className={month.key === today.slice(0, 7) ? "current" : ""} key={month.key} style={{ width: month.count * dayWidth }} title={month.label}><span>{month.label}</span></div>)}</div>
                  {scale === "day" ? <div className="gantt-days">{calendar.days.map((date) => { const weekday = parseDate(date).getDay(); return <div key={date} className={`${weekday === 0 || weekday === 6 ? "weekend " : ""}${date === today ? "today" : ""}`} style={{ width: dayWidth }} title={`${date}${date === today ? " · 今天" : ""}`}><span>{date === today ? "今" : Number(date.slice(8, 10))}</span><small>{WEEKDAYS[weekday]}</small></div>; })}</div> : <div className="gantt-weeks">{calendar.weeks.map((week) => <div key={week.start} style={{ width: week.count * dayWidth }} title={`${week.start} 起 ${week.count} 天`}>{formatShortDate(week.start)}<small>{week.count === 7 ? "一周" : `${week.count} 天`}</small></div>)}</div>}
                </div>
              </div>
              {filteredProjects.map(({ project, rows }) => {
                const range = getProjectDraft(project), summary = projectSummary(project);
                const expanded = isFiltering || !collapsedProjects[project.id];
                return <div className="gantt-project-group" key={project.id}>
                  <div className={`gantt-row project-row${selectedId === project.id ? " selected" : ""}`} data-project-id={project.id}>
                    <div className="gantt-meta" style={{ gridTemplateColumns: gridColumns }}>
                      <div className="gantt-name-cell"><button className="gantt-icon-button gantt-disclosure" disabled={isFiltering || !project.tasks.length} aria-label={`${expanded ? "收起" : "展开"} ${project.name} 的任务`} aria-expanded={expanded} onClick={() => setCollapsedProjects((current) => ({ ...current, [project.id]: !current[project.id] }))}><Icon name={expanded ? "down" : "right"} /></button><span className="gantt-dot" style={{ backgroundColor: project.color }} /><button className="gantt-name" disabled={locked} onClick={() => openEditProject(project)} title={project.name}>{project.name}</button><span className="gantt-project-count" title={`已完成 ${summary.completed} / ${summary.total} 项末级任务`}>{summary.completed}/{summary.total}</span><button className="gantt-icon-button" disabled={locked} aria-label={`为 ${project.name} 添加任务`} onClick={() => openNewTask(project)}><Icon name="plus" /></button><button className="gantt-icon-button gantt-more" disabled={locked} aria-label={`${project.name} 更多操作`} onClick={(event) => openMenu(project, undefined, event.currentTarget)}>···</button></div>
                      {columns.dates && <><div className="gantt-cell" title={range.startDate}>{formatShortDate(range.startDate)}</div><div className="gantt-cell" title={range.endDate}>{formatShortDate(range.endDate)}</div></>}
                      {columns.duration && <div className="gantt-cell">{diffDays(range.startDate, range.endDate) + 1}</div>}
                      {columns.progress && <div className="gantt-cell gantt-project-progress" title="按末级任务进度的算术平均计算，不重复计入父任务"><span className="gantt-mini-progress"><span style={{ width: `${summary.progress}%`, backgroundColor: project.color }} /></span>{summary.total ? `${summary.progress}%` : "—"}</div>}
                    </div><div className="gantt-track">{renderBackground()}{renderBar(project)}</div>
                  </div>
                  {expanded && rows.map(({ task, children, context }) => <div key={task.id}>{renderTaskRow(project, task, false, context)}{(isFiltering || !collapsedTasks[task.id]) && children.map((child) => renderTaskRow(project, child, true))}</div>)}
                  {expanded && project.tasks.length === 0 && <div className="gantt-project-empty"><span>还没有任务，添加第一步计划。</span><button className="gantt-text-button" disabled={locked} onClick={() => openNewTask(project)}>＋ 添加任务</button></div>}
                </div>;
              })}
            </div>
          </div>
          {filteredProjects.length === 0 && <div className="gantt-empty-results"><p>没有匹配的项目或任务</p><button className="gantt-text-button" onClick={() => { setQuery(""); setFilter("all"); }}>清除筛选</button></div>}
        </>}
        <footer className="gantt-footer"><span><span className="gantt-today-key" />今天<span className="gantt-weekend-key" />周末</span><span>拖动任务条平移 · 两端调整工期 · Esc 取消 · 双击编辑</span></footer>
      </div>
      {tooltip && <div className="gantt-drag-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="status"><strong>{formatDateRange(tooltip.range.startDate, tooltip.range.endDate)}</strong><span>{diffDays(tooltip.range.startDate, tooltip.range.endDate) + 1} 天{tooltip.extended ? " · 项目区间将同步扩展" : " · Esc 取消"}</span></div>}
      {menu && <div className="gantt-menu" role="menu" ref={menuRef} style={{ left: menu.x, top: menu.y }} onKeyDown={(event) => { const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); } if (event.key === "Tab") setMenu(null); }}>
        <button role="menuitem" onClick={() => { menu.task ? openEditTask(menu.project, menu.task) : openEditProject(menu.project); setMenu(null); }}>编辑{menu.task ? "任务" : "项目"}</button>
        <button role="menuitem" onClick={() => { locate(menu.task ?? getProjectDraft(menu.project), menu.task?.id ?? menu.project.id); setMenu(null); }}>定位到时间条</button>
        {(!menu.task || !menu.task.parentId) && <button role="menuitem" onClick={() => { openNewTask(menu.project, menu.task?.id); setMenu(null); }}>添加{menu.task ? "子任务" : "任务"}</button>}
        <button role="menuitem" className="danger" onClick={() => { if (menu.task) void handleDeleteTask(menu.task); else void handleDeleteProject(menu.project); setMenu(null); }}>删除{menu.task ? "任务" : "项目"}</button>
      </div>}
      {modal && (
        <div className="habit-modal-overlay" onClick={closeModal}>
          <div
            ref={modalRef}
            aria-labelledby="gantt-modal-title"
            className="habit-modal project-gantt-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="card-title">
              <h2 id="gantt-modal-title">
                {modal.mode === "project"
                  ? editingProject
                    ? "编辑项目"
                    : "新增项目"
                  : editingTask
                    ? "编辑任务"
                    : "新增任务"}
              </h2>
              <button
                className="habit-modal-close"
                type="button"
                onClick={closeModal}
                aria-label="关闭"
              >
                ×
              </button>
            </div>

            {modal.mode === "project" ? (
              <form className="project-gantt-form" onSubmit={handleSaveProject}>
                <fieldset disabled={saving}>
                <label>
                  项目名称
                  <input
                    value={projectForm.name}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="例如：Project 1"
                    required
                    autoFocus
                  />
                </label>
                <div className="project-gantt-form-row">
                  <label>
                    开始日期
                    <input
                      type="date"
                      value={projectForm.startDate}
                      onChange={(event) =>
                        setProjectForm((current) => ({
                          ...current,
                          startDate: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    结束日期
                    <input
                      type="date"
                      value={projectForm.endDate}
                      onChange={(event) =>
                        setProjectForm((current) => ({
                          ...current,
                          endDate: event.target.value,
                        }))
                      }
                      min={projectForm.startDate}
                      required
                    />
                  </label>
                </div>
                <p className="gantt-form-hint">项目日期会自动覆盖所有任务；缩短区间时也会保留任务所需的范围。</p>
                <ColorPicker
                  value={projectForm.color}
                  onChange={(color) =>
                    setProjectForm((current) => ({ ...current, color }))
                  }
                />
                {formError && <p className="project-gantt-form-error">{formError}</p>}
                <div className="project-gantt-form-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={closeModal}
                    disabled={saving}
                  >
                    取消
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? "保存中…" : "保存"}
                  </button>
                </div>
                </fieldset>
              </form>
            ) : (
              <form
                className="project-gantt-form"
                onSubmit={handleSaveTask}
              >
                <fieldset disabled={saving}>
                <label>
                  任务名称
                  <input
                    value={taskForm.name}
                    onChange={(event) =>
                      setTaskForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="例如：task1.1"
                    required
                    autoFocus
                  />
                </label>
                {activeProject && (
                  <label>
                    父任务
                    <select
                      value={taskForm.parentId}
                      disabled={Boolean(editingTask?.children.length)}
                      onChange={(event) =>
                        setTaskForm((current) => ({
                          ...current,
                          parentId: event.target.value,
                        }))
                      }
                    >
                      <option value="">无（直接属于 {activeProject.name}）</option>
                      {parentOptions
                        .filter((task) => task.id !== editingTask?.id)
                        .map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.name}
                          </option>
                        ))}
                    </select>
                    {Boolean(editingTask?.children.length) && (
                      <small className="project-gantt-parent-note">
                        该任务已有子任务，暂时不能调整父任务。
                      </small>
                    )}
                  </label>
                )}
                <div className="project-gantt-form-row">
                  <label>
                    开始日期
                    <input
                      type="date"
                      value={taskForm.startDate}
                      onChange={(event) =>
                        setTaskForm((current) => ({
                          ...current,
                          startDate: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    结束日期
                    <input
                      type="date"
                      value={taskForm.endDate}
                      onChange={(event) =>
                        setTaskForm((current) => ({
                          ...current,
                          endDate: event.target.value,
                        }))
                      }
                      min={taskForm.startDate}
                      required
                    />
                  </label>
                </div>
                <label>
                  完成进度（0-100%）
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={taskForm.progress}
                    onChange={(event) =>
                      setTaskForm((current) => ({
                        ...current,
                        progress: event.target.value,
                      }))
                    }
                  />
                </label>
                <ColorPicker
                  value={taskForm.color}
                  onChange={(color) =>
                    setTaskForm((current) => ({ ...current, color }))
                  }
                />
                {formError && (
                  <p className="project-gantt-form-error">{formError}</p>
                )}
                <div className="project-gantt-form-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={closeModal}
                    disabled={saving}
                  >
                    取消
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? "保存中…" : "保存"}
                  </button>
                </div>
                </fieldset>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function findTask(projects: Project[], taskId?: string) {
  if (!taskId) return undefined;
  for (const project of projects) {
    for (const task of project.tasks) {
      if (task.id === taskId) return task;
      const child = task.children.find((item) => item.id === taskId);
      if (child) return child;
    }
  }
  return undefined;
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="project-gantt-color">
      <span>颜色</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="选择自定义颜色"
      />
      <div className="project-gantt-swatches">
        {COLORS.map((color) => (
          <button
            className={`project-gantt-swatch ${
              value === color ? "active" : ""
            }`}
            key={color}
            type="button"
            style={{ backgroundColor: color }}
            aria-label={`使用颜色 ${color}`}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
}
