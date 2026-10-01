"use client";

import type {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useMemo, useRef, useState } from "react";
import type { Project, ProjectTask, ProjectsData } from "@/lib/project-types";

const DAY_WIDTH = 28;
const TIMELINE_DAYS = 90;
const LABEL_WIDTH = 272;
const INFO_WIDTH = 112;
const HEADER_HEIGHT = 28 * 3;
const DEFAULT_COLOR = "#4f7cff";
const COLORS = [
  "#4f7cff",
  "#22a06b",
  "#f08c00",
  "#8c6bb1",
  "#e15759",
  "#59a14f",
  "#76b7b2",
];

const GANTT_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
};
const GANTT_LABEL_STYLE: CSSProperties = {
  height: 28,
};
const GANTT_HEADER_LABEL_STYLE: CSSProperties = {
  height: HEADER_HEIGHT,
};
const GANTT_TRACK_STYLE: CSSProperties = {
  flex: "0 0 auto",
  height: 28,
};
const GANTT_TIMELINE_STYLE: CSSProperties = {
  flex: "0 0 auto",
  height: HEADER_HEIGHT,
};
const GANTT_DAY_STYLE: CSSProperties = {
  width: DAY_WIDTH,
  height: 28,
  lineHeight: "28px",
};
const GANTT_INFO_STYLE: CSSProperties = {
  flex: "0 0 112px",
  width: INFO_WIDTH,
  height: 28,
};
const GANTT_HEADER_INFO_STYLE: CSSProperties = {
  ...GANTT_INFO_STYLE,
  height: HEADER_HEIGHT,
};

type ModalState =
  | { mode: "project"; projectId?: string }
  | {
      mode: "task";
      projectId: string;
      taskId?: string;
      parentId?: string;
    };

interface ProjectFormState {
  name: string;
  startDate: string;
  endDate: string;
  color: string;
}

interface TaskFormState {
  name: string;
  parentId: string;
  startDate: string;
  endDate: string;
  progress: string;
  color: string;
}

interface TaskCellDraft {
  startDate: string;
  endDate: string;
  duration: string;
}

interface TaskBarDrag {
  task: ProjectTask;
  side: "start" | "end";
  pointerId: number;
  startX: number;
  startDate: string;
  endDate: string;
  latestStartDate: string;
  latestEndDate: string;
  moved: boolean;
}

interface ProjectDateDraft {
  startDate: string;
  endDate: string;
}

interface ProjectBarDrag {
  project: Project;
  side: "start" | "end";
  pointerId: number;
  startX: number;
  startDate: string;
  endDate: string;
  latestStartDate: string;
  latestEndDate: string;
  moved: boolean;
}

interface TimelinePan {
  pointerId: number;
  startX: number;
  startOffsetDays: number;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isValidDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseDate(value);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() === Number(value.slice(5, 7)) - 1 &&
    date.getDate() === Number(value.slice(8, 10))
  );
}

function addDays(date: string, amount: number) {
  const next = parseDate(date);
  next.setDate(next.getDate() + amount);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(
    next.getDate(),
  )}`;
}

function diffDays(start: string, end: string) {
  return Math.round(
    (parseDate(end).getTime() - parseDate(start).getTime()) / 86400000,
  );
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatDateRange(start: string, end: string) {
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function getMonthLabel(date: string) {
  return MONTH_LABELS[Number(date.slice(5, 7)) - 1];
}

function getWeekdayLabel(date: string) {
  return WEEKDAY_LABELS[(parseDate(date).getDay() + 6) % 7];
}

function isWeekendDate(date: string) {
  return (parseDate(date).getDay() + 6) % 7 >= 5;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function getResponseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // Ignore non-JSON responses.
  }
  return fallback;
}

export function ProjectGantt({
  initialData,
}: {
  initialData: ProjectsData;
}) {
  const [data, setData] = useState(initialData);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formError, setFormError] = useState("");
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskCellDraft>>(
    {},
  );
  const [projectDateDrafts, setProjectDateDrafts] = useState<
    Record<string, ProjectDateDraft>
  >({});
  const [collapsedProjects, setCollapsedProjects] = useState<
    Record<string, boolean>
  >({});
  const [collapsedTasks, setCollapsedTasks] = useState<
    Record<string, boolean>
  >({});
  const [timelinePanning, setTimelinePanning] = useState(false);
  const [timelineOffsetDays, setTimelineOffsetDays] = useState(0);
  const [resizingTaskId, setResizingTaskId] = useState<string | null>(null);
  const [resizingProjectId, setResizingProjectId] = useState<string | null>(null);
  const timelinePanRef = useRef<TimelinePan | null>(null);
  const taskBarDragRef = useRef<TaskBarDrag | null>(null);
  const projectBarDragRef = useRef<ProjectBarDrag | null>(null);
  const suppressBarClickRef = useRef<string | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectFormState>({
    name: "",
    startDate: getToday(),
    endDate: addDays(getToday(), 14),
    color: DEFAULT_COLOR,
  });
  const [taskForm, setTaskForm] = useState<TaskFormState>({
    name: "",
    parentId: "",
    startDate: getToday(),
    endDate: addDays(getToday(), 7),
    progress: "0",
    color: DEFAULT_COLOR,
  });

  const timelineWidth = TIMELINE_DAYS * DAY_WIDTH;
  const today = getToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const timelineStart = addDays(monthStart, -7);
  const viewStart = addDays(timelineStart, timelineOffsetDays);
  const timelineDays = useMemo(
    () =>
      Array.from({ length: TIMELINE_DAYS }, (_, index) =>
        addDays(viewStart, index),
      ),
    [viewStart],
  );
  const todayMonth = today.slice(0, 7);
  const monthGroups = useMemo(() => {
    const groups: Array<{
      label: string;
      monthKey: string;
      count: number;
    }> = [];
    for (const date of timelineDays) {
      const label = getMonthLabel(date);
      const monthKey = date.slice(0, 7);
      const current = groups[groups.length - 1];
      if (current?.monthKey === monthKey) {
        current.count += 1;
      } else {
        groups.push({ label, monthKey, count: 1 });
      }
    }
    return groups;
  }, [timelineDays]);
  const todayIndex = diffDays(viewStart, today);
  const editingProject = modal?.mode === "project"
    ? data.projects.find((project) => project.id === modal.projectId)
    : undefined;
  const editingTask =
    modal?.mode === "task"
      ? findTask(data.projects, modal.taskId)
      : undefined;
  const activeProject =
    modal?.mode === "task"
      ? data.projects.find((project) => project.id === modal.projectId)
      : undefined;
  const parentOptions = activeProject
    ? activeProject.tasks.filter(
        (task) =>
          !task.parentId &&
          task.id !==
            (modal?.mode === "task" ? modal.taskId : undefined),
      )
    : [];

  function getTaskDraft(task: ProjectTask) {
    return (
      taskDrafts[task.id] ?? {
        startDate: task.startDate,
        endDate: task.endDate,
        duration: String(diffDays(task.startDate, task.endDate) + 1),
      }
    );
  }

  function getProjectDraft(project: Project): ProjectDateDraft {
    return (
      projectDateDrafts[project.id] ?? {
        startDate: project.startDate,
        endDate: project.endDate,
      }
    );
  }

  function updateTaskDraft(task: ProjectTask, patch: Partial<TaskCellDraft>) {
    setTaskDrafts((current) => ({
      ...current,
      [task.id]: {
        ...getTaskDraft(task),
        ...patch,
      },
    }));
  }

  function rejectTaskDraft(task: ProjectTask) {
    setTaskDrafts((current) => {
      const next = { ...current };
      delete next[task.id];
      return next;
    });
  }

  function rejectProjectDraft(project: Project) {
    setProjectDateDrafts((current) => {
      const next = { ...current };
      delete next[project.id];
      return next;
    });
  }

  function openNewProject() {
    const today = getToday();
    setProjectForm({
      name: "",
      startDate: today,
      endDate: addDays(today, 14),
      color: DEFAULT_COLOR,
    });
    setFormError("");
    setModal({ mode: "project" });
  }

  function openEditProject(project: Project) {
    const draft = getProjectDraft(project);
    setProjectForm({
      name: project.name,
      startDate: draft.startDate,
      endDate: draft.endDate,
      color: project.color,
    });
    setFormError("");
    setModal({ mode: "project", projectId: project.id });
  }

  function openNewTask(project: Project, parentId?: string) {
    const projectDraft = getProjectDraft(project);
    const parent = parentId
      ? findTask([project], parentId)
      : undefined;
    const startDate = parent?.startDate ?? projectDraft.startDate;
    const endDate = parent?.endDate ?? projectDraft.endDate;
    setTaskForm({
      name: "",
      parentId: parentId ?? "",
      startDate,
      endDate,
      progress: "0",
      color: parent?.color ?? project.color,
    });
    setFormError("");
    setModal({
      mode: "task",
      projectId: project.id,
      parentId,
    });
  }

  function openEditTask(project: Project, task: ProjectTask) {
    setTaskForm({
      name: task.name,
      parentId: task.parentId ?? "",
      startDate: task.startDate,
      endDate: task.endDate,
      progress: String(task.progress),
      color: task.color,
    });
    setFormError("");
    setModal({
      mode: "task",
      projectId: project.id,
      taskId: task.id,
      parentId: task.parentId ?? undefined,
    });
  }

  function closeModal() {
    if (saving) return;
    setModal(null);
    setFormError("");
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/projects", {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        window.alert(
          await getResponseError(response, "刷新项目数据失败"),
        );
        return;
      }
      setData((await response.json()) as ProjectsData);
    } catch (error) {
      console.error(error);
      window.alert("刷新项目数据失败");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSaveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectForm.name.trim()) return;
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(
        editingProject
          ? `/api/projects/${editingProject.id}`
          : "/api/projects",
        {
          method: editingProject ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectForm),
        },
      );
      if (!response.ok) {
        setFormError(
          await getResponseError(
            response,
            editingProject ? "保存项目失败" : "新增项目失败",
          ),
        );
        return;
      }
      setModal(null);
      setFormError("");
      await refresh();
    } catch (error) {
      console.error(error);
      setFormError("保存项目失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskForm.name.trim() || !activeProject) return;
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(
        editingTask
          ? `/api/projects/tasks/${editingTask.id}`
          : "/api/projects/tasks",
        {
          method: editingTask ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: activeProject.id,
            parentId: taskForm.parentId || null,
            name: taskForm.name,
            startDate: taskForm.startDate,
            endDate: taskForm.endDate,
            progress: Number(taskForm.progress || 0),
            color: taskForm.color,
          }),
        },
      );
      if (!response.ok) {
        setFormError(
          await getResponseError(
            response,
            editingTask ? "保存任务失败" : "新增任务失败",
          ),
        );
        return;
      }
      setModal(null);
      setFormError("");
      await refresh();
    } catch (error) {
      console.error(error);
      setFormError("保存任务失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProject(project: Project) {
    if (
      !window.confirm(
        `确定删除项目“${project.name}”吗？项目下的所有任务也会一并删除。`,
      )
    ) {
      return;
    }
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert(await getResponseError(response, "删除项目失败"));
      return;
    }
    await refresh();
  }

  async function handleDeleteTask(task: ProjectTask) {
    const childCount = task.children.length;
    if (
      !window.confirm(
        childCount
          ? `确定删除任务“${task.name}”吗？它的 ${childCount} 个子任务也会一并删除。`
          : `确定删除任务“${task.name}”吗？`,
      )
    ) {
      return;
    }
    const response = await fetch(`/api/projects/tasks/${task.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert(await getResponseError(response, "删除任务失败"));
      return;
    }
    await refresh();
  }

  async function saveTaskDates(
    task: ProjectTask,
    patch: { startDate?: string; endDate?: string },
  ) {
    const response = await fetch(`/api/projects/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      window.alert(await getResponseError(response, "更新任务日期失败"));
      rejectTaskDraft(task);
      await refresh();
      return;
    }
    rejectTaskDraft(task);
    await refresh();
  }

  async function saveProjectDates(
    project: Project,
    patch: Partial<ProjectDateDraft>,
  ) {
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      window.alert(await getResponseError(response, "更新项目日期失败"));
      rejectProjectDraft(project);
      await refresh();
      return;
    }
    rejectProjectDraft(project);
    await refresh();
  }

  function previewTaskDates(
    task: ProjectTask,
    startDate: string,
    endDate: string,
  ) {
    setTaskDrafts((current) => {
      const draft = current[task.id] ?? {
        startDate: task.startDate,
        endDate: task.endDate,
        duration: String(diffDays(task.startDate, task.endDate) + 1),
      };
      return {
        ...current,
        [task.id]: {
          ...draft,
          startDate,
          endDate,
          duration: String(diffDays(startDate, endDate) + 1),
        },
      };
    });
  }

  function previewProjectDates(
    project: Project,
    startDate: string,
    endDate: string,
  ) {
    setProjectDateDrafts((current) => ({
      ...current,
      [project.id]: { startDate, endDate },
    }));
  }

  function handleTimelinePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    timelinePanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffsetDays: timelineOffsetDays,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setTimelinePanning(true);
  }

  function handleTimelinePointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const pan = timelinePanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const distance = event.clientX - pan.startX;
    const dayDelta = Math.round(-distance / DAY_WIDTH);
    setTimelineOffsetDays(pan.startOffsetDays + dayDelta);
  }

  function handleTimelinePointerEnd(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (timelinePanRef.current?.pointerId !== event.pointerId) return;
    timelinePanRef.current = null;
    setTimelinePanning(false);
  }

  function handleTaskBarPointerDown(
    task: ProjectTask,
    draft: TaskCellDraft,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    if (!(event.target instanceof Element)) return;
    const side = event.target.closest(".project-gantt-resize-grip-start")
      ? "start"
      : event.target.closest(".project-gantt-resize-grip-end")
        ? "end"
        : null;
    if (!side) return;

    taskBarDragRef.current = {
      task,
      side,
      pointerId: event.pointerId,
      startX: event.clientX,
      startDate: draft.startDate,
      endDate: draft.endDate,
      latestStartDate: draft.startDate,
      latestEndDate: draft.endDate,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizingTaskId(task.id);
  }

  function handleTaskBarPointerMove(
    task: ProjectTask,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const drag = taskBarDragRef.current;
    if (!drag || drag.task.id !== task.id || drag.pointerId !== event.pointerId) {
      return;
    }
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) < 2) return;
    drag.moved = true;

    const dayDelta = Math.round(distance / DAY_WIDTH);
    if (drag.side === "start") {
      const boundedDelta = Math.min(
        dayDelta,
        diffDays(drag.startDate, drag.endDate),
      );
      drag.latestStartDate = addDays(drag.startDate, boundedDelta);
    } else {
      const boundedDelta = Math.max(
        dayDelta,
        -diffDays(drag.startDate, drag.endDate),
      );
      drag.latestEndDate = addDays(drag.endDate, boundedDelta);
    }
    previewTaskDates(drag.task, drag.latestStartDate, drag.latestEndDate);
  }

  function suppressNextBarClick(taskId: string) {
    suppressBarClickRef.current = taskId;
    window.setTimeout(() => {
      if (suppressBarClickRef.current === taskId) {
        suppressBarClickRef.current = null;
      }
    }, 0);
  }

  function handleTaskBarPointerUp(
    task: ProjectTask,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const drag = taskBarDragRef.current;
    if (!drag || drag.task.id !== task.id || drag.pointerId !== event.pointerId) {
      return;
    }
    taskBarDragRef.current = null;
    setResizingTaskId(null);
    if (!drag.moved) return;

    suppressNextBarClick(task.id);
    if (
      drag.latestStartDate !== drag.startDate ||
      drag.latestEndDate !== drag.endDate
    ) {
      void saveTaskDates(task, {
        startDate: drag.latestStartDate,
        endDate: drag.latestEndDate,
      });
    } else {
      rejectTaskDraft(task);
    }
  }

  function handleTaskBarPointerCancel(
    task: ProjectTask,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const drag = taskBarDragRef.current;
    if (!drag || drag.task.id !== task.id || drag.pointerId !== event.pointerId) {
      return;
    }
    taskBarDragRef.current = null;
    setResizingTaskId(null);
    if (drag.moved) {
      suppressNextBarClick(task.id);
      rejectTaskDraft(task);
    }
  }

  function handleProjectBarPointerDown(
    project: Project,
    draft: ProjectDateDraft,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    if (!(event.target instanceof Element)) return;
    const side = event.target.closest(".project-gantt-resize-grip-start")
      ? "start"
      : event.target.closest(".project-gantt-resize-grip-end")
        ? "end"
        : null;
    if (!side) return;

    projectBarDragRef.current = {
      project,
      side,
      pointerId: event.pointerId,
      startX: event.clientX,
      startDate: draft.startDate,
      endDate: draft.endDate,
      latestStartDate: draft.startDate,
      latestEndDate: draft.endDate,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizingProjectId(project.id);
  }

  function handleProjectBarPointerMove(
    project: Project,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const drag = projectBarDragRef.current;
    if (
      !drag ||
      drag.project.id !== project.id ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) < 2) return;
    drag.moved = true;

    const dayDelta = Math.round(distance / DAY_WIDTH);
    if (drag.side === "start") {
      const boundedDelta = Math.min(
        dayDelta,
        diffDays(drag.startDate, drag.endDate),
      );
      drag.latestStartDate = addDays(drag.startDate, boundedDelta);
    } else {
      const boundedDelta = Math.max(
        dayDelta,
        -diffDays(drag.startDate, drag.endDate),
      );
      drag.latestEndDate = addDays(drag.endDate, boundedDelta);
    }
    previewProjectDates(
      drag.project,
      drag.latestStartDate,
      drag.latestEndDate,
    );
  }

  function handleProjectBarPointerUp(
    project: Project,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const drag = projectBarDragRef.current;
    if (
      !drag ||
      drag.project.id !== project.id ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }
    projectBarDragRef.current = null;
    setResizingProjectId(null);
    if (!drag.moved) return;
    if (
      drag.latestStartDate !== drag.startDate ||
      drag.latestEndDate !== drag.endDate
    ) {
      void saveProjectDates(project, {
        startDate: drag.latestStartDate,
        endDate: drag.latestEndDate,
      });
    } else {
      rejectProjectDraft(project);
    }
  }

  function handleProjectBarPointerCancel(
    project: Project,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const drag = projectBarDragRef.current;
    if (
      !drag ||
      drag.project.id !== project.id ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }
    projectBarDragRef.current = null;
    setResizingProjectId(null);
    if (drag.moved) rejectProjectDraft(project);
  }

  function renderTaskBar(
    project: Project,
    task: ProjectTask,
    draft: TaskCellDraft,
    isChild = false,
  ) {
    return (
      <button
        className={`project-gantt-bar project-gantt-task-bar${
          isChild ? " project-gantt-child-bar" : ""
        }${resizingTaskId === task.id ? " is-resizing" : ""}`}
        style={{
          ...getBarStyle(draft.startDate, draft.endDate),
          backgroundColor: task.color,
        }}
        type="button"
        onClick={() => {
          if (suppressBarClickRef.current === task.id) {
            suppressBarClickRef.current = null;
            return;
          }
          openEditTask(project, task);
        }}
        onPointerDown={(event) =>
          handleTaskBarPointerDown(task, draft, event)
        }
        onPointerMove={(event) => handleTaskBarPointerMove(task, event)}
        onPointerUp={(event) => handleTaskBarPointerUp(task, event)}
        onPointerCancel={(event) => handleTaskBarPointerCancel(task, event)}
        title={`${task.name} · ${formatDateRange(
          draft.startDate,
          draft.endDate,
        )} · ${task.progress}% · 拖动两端调整日期`}
      >
        <span
          className="project-gantt-bar-progress"
          style={{ width: `${clamp(task.progress, 0, 100)}%` }}
        />
        <span className="project-gantt-bar-label">{task.name}</span>
        <span
          className="project-gantt-resize-grip-start"
          aria-hidden="true"
        />
        <span
          className="project-gantt-resize-grip-end"
          aria-hidden="true"
        />
      </button>
    );
  }

  async function handleStartDateBlur(task: ProjectTask) {
    const draft = getTaskDraft(task);
    const days = Number(draft.duration);
    if (!isValidDateValue(draft.startDate) || !Number.isFinite(days) || days < 1) {
      window.alert("开始日期或持续天数无效");
      rejectTaskDraft(task);
      return;
    }
    await saveTaskDates(task, {
      startDate: draft.startDate,
      endDate: addDays(draft.startDate, days - 1),
    });
  }

  async function handleEndDateBlur(task: ProjectTask) {
    const draft = getTaskDraft(task);
    if (
      !isValidDateValue(draft.endDate) ||
      draft.endDate < draft.startDate
    ) {
      window.alert("结束日期不能早于开始日期");
      rejectTaskDraft(task);
      return;
    }
    await saveTaskDates(task, { endDate: draft.endDate });
  }

  async function handleDurationBlur(task: ProjectTask) {
    const draft = getTaskDraft(task);
    const days = Number(draft.duration);
    if (!Number.isInteger(days) || days < 1) {
      window.alert("Duration in Days 必须是大于 0 的整数");
      rejectTaskDraft(task);
      return;
    }
    if (!isValidDateValue(draft.startDate)) {
      window.alert("开始日期无效");
      rejectTaskDraft(task);
      return;
    }
    await saveTaskDates(task, {
      endDate: addDays(draft.startDate, days - 1),
    });
  }

  function getBarStyle(
    startDate: string,
    endDate: string,
  ): CSSProperties {
    const visibleDays = TIMELINE_DAYS;
    const viewEnd = addDays(viewStart, visibleDays - 1);
    if (endDate < viewStart || startDate > viewEnd) {
      return { display: "none" };
    }
    const start = clamp(
      diffDays(viewStart, startDate),
      0,
      visibleDays - 1,
    );
    const end = clamp(
      diffDays(viewStart, endDate),
      start,
      visibleDays - 1,
    );
    return {
      left: `${(start / visibleDays) * 100}%`,
      width: `${((end - start + 1) / visibleDays) * 100}%`,
    };
  }

  function renderTodayColumn() {
    if (todayIndex < 0 || todayIndex >= TIMELINE_DAYS) return null;
    return (
      <span
        className="project-gantt-today-column"
        style={{ left: todayIndex * DAY_WIDTH }}
        aria-hidden="true"
      />
    );
  }

  function renderTaskRows(project: Project) {
    return project.tasks.flatMap((task) => {
      const draft = getTaskDraft(task);
      const rows = [
        <div
          className="project-gantt-row project-gantt-task-row"
          key={task.id}
          style={GANTT_ROW_STYLE}
        >
          <div className="project-gantt-label-cell" style={GANTT_LABEL_STYLE}>
            <div className="project-gantt-task-label">
              {task.children.length > 0 ? (
                <button
                  className="project-gantt-collapse-button"
                  type="button"
                  title={collapsedTasks[task.id] ? "展开子任务" : "收起子任务"}
                  aria-label={`${collapsedTasks[task.id] ? "展开" : "收起"} ${task.name} 的子任务`}
                  aria-expanded={!collapsedTasks[task.id]}
                  onClick={() =>
                    setCollapsedTasks((current) => ({
                      ...current,
                      [task.id]: !current[task.id],
                    }))
                  }
                >
                  {collapsedTasks[task.id] ? "▸" : "▾"}
                </button>
              ) : (
                <span className="project-gantt-collapse-spacer" />
              )}
              <button
                className="project-gantt-title project-gantt-task-title"
                type="button"
                onClick={() => openEditTask(project, task)}
                title={`${task.name} (${formatDateRange(
                  draft.startDate,
                  draft.endDate,
                )})`}
              >
                <span
                  className="project-gantt-dot"
                  style={{ backgroundColor: task.color }}
                />
                <span className="project-gantt-name">{task.name}</span>
              </button>
            </div>
            <div className="project-gantt-row-actions">
              {!task.parentId && (
                <button
                  className="project-gantt-mini-button"
                  type="button"
                  title="添加子任务"
                  aria-label={`为 ${task.name} 添加子任务`}
                  onClick={() => openNewTask(project, task.id)}
                >
                  ＋
                </button>
              )}
              <button
                className="project-gantt-mini-button danger"
                type="button"
                title="删除任务"
                aria-label={`删除任务 ${task.name}`}
                onClick={() => void handleDeleteTask(task)}
              >
                ×
              </button>
            </div>
          </div>
          <div
            className="project-gantt-info-cell project-gantt-info-editable"
            style={GANTT_INFO_STYLE}
          >
            <input
              className="project-gantt-cell-input"
              type="date"
              value={draft.startDate}
              aria-label={`${task.name} start date`}
              onChange={(event) => {
                const startDate = event.target.value;
                const current = getTaskDraft(task);
                const days = Number(current.duration);
                updateTaskDraft(task, {
                  startDate,
                  endDate:
                    isValidDateValue(startDate) &&
                    Number.isInteger(days) &&
                    days >= 1
                      ? addDays(startDate, days - 1)
                      : current.endDate,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={() => void handleStartDateBlur(task)}
            />
          </div>
          <div
            className="project-gantt-info-cell project-gantt-info-editable"
            style={GANTT_INFO_STYLE}
          >
            <input
              className="project-gantt-cell-input"
              type="date"
              value={draft.endDate}
              aria-label={`${task.name} due date`}
              onChange={(event) => {
                const endDate = event.target.value;
                const current = getTaskDraft(task);
                updateTaskDraft(task, {
                  endDate,
                  duration:
                    isValidDateValue(endDate) &&
                    endDate >= current.startDate
                      ? String(diffDays(current.startDate, endDate) + 1)
                      : current.duration,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={() => void handleEndDateBlur(task)}
            />
          </div>
          <div
            className="project-gantt-info-cell project-gantt-info-editable"
            style={GANTT_INFO_STYLE}
          >
            <input
              className="project-gantt-cell-input"
              type="number"
              min="1"
              step="1"
              value={draft.duration}
              aria-label={`${task.name} duration in days`}
              onChange={(event) => {
                const duration = event.target.value;
                const days = Number(duration);
                const current = getTaskDraft(task);
                updateTaskDraft(task, {
                  duration,
                  endDate:
                    Number.isInteger(days) &&
                    days >= 1 &&
                    isValidDateValue(current.startDate)
                      ? addDays(current.startDate, days - 1)
                      : current.endDate,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={() => void handleDurationBlur(task)}
            />
          </div>
          <div className="project-gantt-info-cell" style={GANTT_INFO_STYLE}>
            {clamp(task.progress, 0, 100)}%
          </div>
          <div
            className="project-gantt-track"
            style={{ ...GANTT_TRACK_STYLE, width: timelineWidth }}
          >
            {renderTodayColumn()}
            {renderTaskBar(project, task, draft)}
          </div>
        </div>,
      ];

      if (!collapsedTasks[task.id]) {
        task.children.forEach((child) => {
          const draft = getTaskDraft(child);
          rows.push(
          <div
            className="project-gantt-row project-gantt-subtask-row"
            key={child.id}
            style={GANTT_ROW_STYLE}
          >
            <div className="project-gantt-label-cell" style={GANTT_LABEL_STYLE}>
              <button
                className="project-gantt-title project-gantt-task-title"
                type="button"
                onClick={() => openEditTask(project, child)}
                title={`${child.name} (${formatDateRange(
                  draft.startDate,
                  draft.endDate,
                )})`}
              >
                <span className="project-gantt-subtask-mark">└</span>
                <span
                  className="project-gantt-dot"
                  style={{ backgroundColor: child.color }}
                />
                <span className="project-gantt-name">{child.name}</span>
              </button>
              <div className="project-gantt-row-actions">
                <button
                  className="project-gantt-mini-button danger"
                  type="button"
                  title="删除任务"
                  aria-label={`删除任务 ${child.name}`}
                  onClick={() => void handleDeleteTask(child)}
                >
                  ×
                </button>
              </div>
            </div>
            <div
              className="project-gantt-info-cell project-gantt-info-editable"
              style={GANTT_INFO_STYLE}
            >
              <input
                className="project-gantt-cell-input"
                type="date"
                value={draft.startDate}
                aria-label={`${child.name} start date`}
                onChange={(event) => {
                  const startDate = event.target.value;
                  const current = getTaskDraft(child);
                  const days = Number(current.duration);
                  updateTaskDraft(child, {
                    startDate,
                    endDate:
                      isValidDateValue(startDate) &&
                      Number.isInteger(days) &&
                      days >= 1
                        ? addDays(startDate, days - 1)
                        : current.endDate,
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                onBlur={() => void handleStartDateBlur(child)}
              />
            </div>
            <div
              className="project-gantt-info-cell project-gantt-info-editable"
              style={GANTT_INFO_STYLE}
            >
              <input
                className="project-gantt-cell-input"
                type="date"
                value={draft.endDate}
                aria-label={`${child.name} due date`}
                onChange={(event) => {
                  const endDate = event.target.value;
                  const current = getTaskDraft(child);
                  updateTaskDraft(child, {
                    endDate,
                    duration:
                      isValidDateValue(endDate) &&
                      endDate >= current.startDate
                        ? String(
                            diffDays(current.startDate, endDate) + 1,
                          )
                        : current.duration,
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                onBlur={() => void handleEndDateBlur(child)}
              />
            </div>
            <div
              className="project-gantt-info-cell project-gantt-info-editable"
              style={GANTT_INFO_STYLE}
            >
              <input
                className="project-gantt-cell-input"
                type="number"
                min="1"
                step="1"
                value={draft.duration}
                aria-label={`${child.name} duration in days`}
                onChange={(event) => {
                  const duration = event.target.value;
                  const days = Number(duration);
                  const current = getTaskDraft(child);
                  updateTaskDraft(child, {
                    duration,
                    endDate:
                      Number.isInteger(days) &&
                      days >= 1 &&
                      isValidDateValue(current.startDate)
                        ? addDays(current.startDate, days - 1)
                        : current.endDate,
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                onBlur={() => void handleDurationBlur(child)}
              />
            </div>
            <div className="project-gantt-info-cell" style={GANTT_INFO_STYLE}>
              {clamp(child.progress, 0, 100)}%
            </div>
            <div
              className="project-gantt-track"
              style={{ ...GANTT_TRACK_STYLE, width: timelineWidth }}
            >
              {renderTodayColumn()}
              {renderTaskBar(project, child, draft, true)}
            </div>
          </div>,
          );
        });
      }

      return rows;
    });
  }

  return (
    <>
      <div className="project-gantt-header">
        <div className="project-gantt-heading">
          <h2>项目甘特图</h2>
          <p>管理项目及其下属任务，按日期查看和调整每项任务的时间线。</p>
        </div>
        <div className="project-gantt-actions">
          <span className="project-gantt-refresh">
            {refreshing ? "刷新中…" : "数据已自动保存"}
          </span>
          <button
            className="primary-button"
            type="button"
            onClick={openNewProject}
          >
            ＋ 新增项目
          </button>
        </div>
      </div>

      {data.projects.length === 0 ? (
        <section className="card project-gantt-empty">
          <h3>还没有项目</h3>
          <p>先新增一个项目，再在项目下添加任务并安排开始/结束日期。</p>
          <button
            className="primary-button"
            type="button"
            onClick={openNewProject}
          >
            ＋ 新增项目
          </button>
        </section>
      ) : (
        <section className="card project-gantt-card">
          <div className="project-gantt-hint">
            时间轴固定显示90天，当前日期列会高亮；按住日期刻度可左右平移，拖动项目或任务条两端可调整日期。
          </div>
          <div className="project-gantt-scroll">
            <div
              className="project-gantt-canvas"
              style={{
                width: LABEL_WIDTH + INFO_WIDTH * 4 + timelineWidth,
              }}
            >
              <div
                className="project-gantt-grid-row project-gantt-header-row"
                style={GANTT_ROW_STYLE}
              >
                <div
                  className="project-gantt-label-cell project-gantt-header-label"
                  style={GANTT_HEADER_LABEL_STYLE}
                >
                  项目 / Task
                </div>
                {[
                  "Start Date",
                  "Due Date",
                  "Duration in Days",
                  "Progress",
                ].map((label) => (
                  <div
                    className="project-gantt-info-cell project-gantt-info-header"
                    key={label}
                    style={GANTT_HEADER_INFO_STYLE}
                  >
                    {label}
                  </div>
                ))}
                <div
                  className={`project-gantt-timeline${
                    timelinePanning ? " is-panning" : ""
                  }`}
                  style={{
                    ...GANTT_TIMELINE_STYLE,
                    width: timelineWidth,
                  }}
                  onPointerDown={handleTimelinePointerDown}
                  onPointerMove={handleTimelinePointerMove}
                  onPointerUp={handleTimelinePointerEnd}
                  onPointerCancel={handleTimelinePointerEnd}
                >
                  <div className="project-gantt-calendar-row project-gantt-calendar-months">
                    {monthGroups.map((group) => (
                      <div
                        className={`project-gantt-month-cell ${
                          group.monthKey === todayMonth
                            ? "project-gantt-current-month"
                            : group.monthKey < todayMonth
                              ? "project-gantt-previous-month"
                              : "project-gantt-next-month"
                        }`}
                        key={group.monthKey}
                        style={{ width: group.count * DAY_WIDTH }}
                      >
                        {group.label}
                      </div>
                    ))}
                  </div>
                  <div className="project-gantt-calendar-row project-gantt-calendar-days">
                    {timelineDays.map((date) => (
                      <div
                        className={`project-gantt-day ${
                          date.slice(0, 7) === todayMonth
                            ? "project-gantt-current-day"
                            : "project-gantt-outside-month-day"
                        } ${
                          isWeekendDate(date) ? "weekend" : "weekday"
                        } ${date === getToday() ? "today" : ""}`}
                        key={date}
                        style={GANTT_DAY_STYLE}
                        title={date}
                      >
                        {Number(date.slice(8, 10))}
                      </div>
                    ))}
                  </div>
                  <div className="project-gantt-calendar-row project-gantt-calendar-weekdays">
                    {timelineDays.map((date) => (
                      <div
                        className={`project-gantt-day project-gantt-weekday-cell ${
                          date.slice(0, 7) === todayMonth
                            ? "project-gantt-current-day"
                            : "project-gantt-outside-month-day"
                        } ${
                          isWeekendDate(date) ? "weekend" : "weekday"
                        } ${date === getToday() ? "today" : ""}`}
                        key={date}
                        style={GANTT_DAY_STYLE}
                        title={date}
                      >
                        {getWeekdayLabel(date)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {data.projects.map((project) => {
                const projectDraft = getProjectDraft(project);
                return (
                  <section className="project-gantt-group" key={project.id}>
                  <div
                    className="project-gantt-grid-row project-gantt-project-row"
                    style={GANTT_ROW_STYLE}
                  >
                    <div className="project-gantt-label-cell" style={GANTT_LABEL_STYLE}>
                      <div className="project-gantt-project-info">
                        {project.tasks.length > 0 ? (
                          <button
                            className="project-gantt-collapse-button"
                            type="button"
                            title={
                              collapsedProjects[project.id]
                                ? "展开项目任务"
                                : "收起项目任务"
                            }
                            aria-label={`${collapsedProjects[project.id] ? "展开" : "收起"} ${project.name} 的任务`}
                            aria-expanded={!collapsedProjects[project.id]}
                            onClick={() =>
                              setCollapsedProjects((current) => ({
                                ...current,
                                [project.id]: !current[project.id],
                              }))
                            }
                          >
                            {collapsedProjects[project.id] ? "▸" : "▾"}
                          </button>
                        ) : (
                          <span className="project-gantt-collapse-spacer" />
                        )}
                        <button
                          className="project-gantt-title project-gantt-project-title"
                          type="button"
                          onClick={() => openEditProject(project)}
                          title={project.name}
                        >
                          <span
                            className="project-gantt-dot project-gantt-project-dot"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="project-gantt-name">
                            {project.name}
                          </span>
                        </button>
                      </div>
                      <div className="project-gantt-row-actions">
                        <button
                          className="project-gantt-mini-button"
                          type="button"
                          title="编辑项目"
                          aria-label={`编辑项目 ${project.name}`}
                          onClick={() => openEditProject(project)}
                        >
                          ✎
                        </button>
                        <button
                          className="project-gantt-mini-button"
                          type="button"
                          title="添加任务"
                          aria-label={`为 ${project.name} 添加任务`}
                          onClick={() => openNewTask(project)}
                        >
                          ＋
                        </button>
                        <button
                          className="project-gantt-mini-button danger"
                          type="button"
                          title="删除项目"
                          aria-label={`删除项目 ${project.name}`}
                          onClick={() => void handleDeleteProject(project)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="project-gantt-info-cell" style={GANTT_INFO_STYLE}>
                      {projectDraft.startDate}
                    </div>
                    <div className="project-gantt-info-cell" style={GANTT_INFO_STYLE}>
                      {projectDraft.endDate}
                    </div>
                    <div className="project-gantt-info-cell" style={GANTT_INFO_STYLE}>
                      {diffDays(projectDraft.startDate, projectDraft.endDate) + 1}
                    </div>
                    <div className="project-gantt-info-cell project-gantt-info-placeholder" style={GANTT_INFO_STYLE}>
                      --
                    </div>
                    <div
                      className="project-gantt-track"
                      style={{ ...GANTT_TRACK_STYLE, width: timelineWidth }}
                    >
                      {renderTodayColumn()}
                      <div
                        className={`project-gantt-bar project-gantt-project-bar${
                          resizingProjectId === project.id ? " is-resizing" : ""
                        }`}
                        style={{
                          ...getBarStyle(
                            projectDraft.startDate,
                            projectDraft.endDate,
                          ),
                          backgroundColor: project.color,
                          borderColor: project.color,
                        }}
                        onPointerDown={(event) =>
                          handleProjectBarPointerDown(
                            project,
                            projectDraft,
                            event,
                          )
                        }
                        onPointerMove={(event) =>
                          handleProjectBarPointerMove(project, event)
                        }
                        onPointerUp={(event) =>
                          handleProjectBarPointerUp(project, event)
                        }
                        onPointerCancel={(event) =>
                          handleProjectBarPointerCancel(project, event)
                        }
                        title={`${project.name} · ${formatDateRange(
                          projectDraft.startDate,
                          projectDraft.endDate,
                        )} · 拖动两端调整日期`}
                      >
                        <span className="project-gantt-bar-label">
                          {project.name}
                        </span>
                        <span
                          className="project-gantt-resize-grip-start"
                          aria-hidden="true"
                        />
                        <span
                          className="project-gantt-resize-grip-end"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </div>

                  {!collapsedProjects[project.id] && renderTaskRows(project)}

                  {!collapsedProjects[project.id] && project.tasks.length === 0 && (
                    <div
                      className="project-gantt-grid-row project-gantt-task-row project-gantt-no-task-row"
                      style={GANTT_ROW_STYLE}
                    >
                      <div className="project-gantt-label-cell" style={GANTT_LABEL_STYLE}>
                        暂无任务
                      </div>
                      {Array.from({ length: 4 }, (_, index) => (
                        <div
                          className="project-gantt-info-cell project-gantt-info-placeholder"
                          key={`empty-${index}`}
                          style={GANTT_INFO_STYLE}
                        />
                      ))}
                      <div
                        className="project-gantt-empty-track"
                        style={{
                          ...GANTT_TRACK_STYLE,
                          width: timelineWidth,
                        }}
                      >
                        {renderTodayColumn()}
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => openNewTask(project)}
                        >
                          ＋ 添加第一个任务
                        </button>
                      </div>
                    </div>
                  )}
                  </section>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {modal && (
        <div className="habit-modal-overlay" onClick={closeModal}>
          <div
            className="habit-modal project-gantt-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="card-title">
              <h2>
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
              </form>
            ) : (
              <form
                className="project-gantt-form"
                onSubmit={handleSaveTask}
              >
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
              </form>
            )}
          </div>
        </div>
      )}
    </>
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
