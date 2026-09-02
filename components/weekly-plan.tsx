"use client";

import type { FocusEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import type {
  WeeklyData,
  WeeklyDiary,
  WeeklyRecord,
  WeeklyTask,
} from "@/lib/weekly-types";
import { EChart } from "./echart";

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, amount: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + amount);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: string) {
  const current = new Date(`${date}T00:00:00`);
  const day = current.getDay();
  current.setDate(current.getDate() - (day === 0 ? 6 : day - 1));
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const dateString = String(current.getDate()).padStart(2, "0");
  return `${year}-${month}-${dateString}`;
}

function shiftMonth(date: string, delta: number) {
  const current = new Date(`${date}T00:00:00`);
  const next = new Date(current.getFullYear(), current.getMonth() + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(
    2,
    "0",
  )}-01`;
}

async function getResponseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // Ignore non-JSON error responses.
  }
  return fallback;
}

function getMonthGrid(date: string) {
  const base = new Date(`${date}T00:00:00`);
  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - offset);

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    return {
      date: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(current.getDate()).padStart(2, "0")}`,
      day: current.getDate(),
      inMonth: current.getMonth() === month,
    };
  });
}

function getMonthTitle(date: string) {
  const current = new Date(`${date}T00:00:00`);
  return `${current.getFullYear()} 年 ${current.getMonth() + 1} 月`;
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${month}/${day}`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

function getWeekNumber(date: string) {
  const current = new Date(`${date}T00:00:00`);
  const dayIndex = (current.getDay() + 6) % 7;
  current.setDate(current.getDate() - dayIndex + 3);
  const firstThursday = new Date(current.getFullYear(), 0, 4);
  const firstDayIndex = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayIndex + 3);
  return 1 + Math.round(
    (current.getTime() - firstThursday.getTime()) / 604800000,
  );
}

type DailyHabit = {
  name: string;
  count: number;
  minutes: number;
};

const DAILY_HABIT_TEMPLATE: DailyHabit[] = [
  { name: "金刚功", count: 7, minutes: 30 },
  { name: "敲胆经", count: 0, minutes: 0 },
  { name: "靠墙蹲", count: 0, minutes: 0 },
  { name: "金刚跪", count: 0, minutes: 0 },
  { name: "禁抖音", count: 0, minutes: 0 },
  { name: "禁水果", count: 0, minutes: 0 },
  { name: "艾灸膝盖", count: 0, minutes: 0 },
  { name: "行禅", count: 0, minutes: 0 },
];

const TASK_TYPE_LABELS: Record<string, string> = {
  once: "Once",
  daily: "Daily",
  weekly: "Weekly",
};

const TASK_CATEGORY_LABELS: Record<string, string> = {
  recitation: "背诵",
  practice: "实修",
  reading: "阅读",
  work: "工作",
  leisure: "业余",
};

function normalizeDailyHabits(value: unknown) {
  if (!Array.isArray(value)) return DAILY_HABIT_TEMPLATE;
  const habits = value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .map((item) => ({
      name: typeof item.name === "string" ? item.name.trim() : "",
      count: Math.max(0, Number(item.count) || 0),
      minutes: Math.max(0, Number(item.minutes) || 0),
    }))
    .filter((habit) => habit.name);
  return habits;
}

function createEmptyDailyChecks(habits: readonly DailyHabit[]) {
  return Object.fromEntries(
    habits.map((habit) => [
      habit.name,
      Array.from({ length: 7 }, () => false),
    ]),
  );
}

export function WeeklyPlan({ initialData }: { initialData: WeeklyData }) {
  const [data, setData] = useState(initialData);
  const [weekStart, setWeekStart] = useState(initialData.weekStart);
  const today = getToday();
  const [selectedDate, setSelectedDate] = useState(
    initialData.days.find((day) => day.isToday)?.date ??
      initialData.weekStart,
  );
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(
    initialData.days.find((day) => day.isToday)?.date ??
      initialData.weekStart,
  );
  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    estimatedDuration: "",
    taskType: "once",
    category: "work",
  });
  const [dayTaskMenuOpen, setDayTaskMenuOpen] = useState<Record<string, boolean>>({});
  const [recordDurations, setRecordDurations] = useState<Record<string, string>>({});
  const [diaryDrafts, setDiaryDrafts] = useState<Record<string, string>>({});
  const [reviewText, setReviewText] = useState("");
  const [dailyHabitChecks, setDailyHabitChecks] = useState<
    Record<string, boolean[]>
  >({});
  const [dailyHabits, setDailyHabits] =
    useState<DailyHabit[]>(DAILY_HABIT_TEMPLATE);
  const [dailyHabitFormOpen, setDailyHabitFormOpen] = useState(false);
  const [dailyHabitForm, setDailyHabitForm] = useState({
    name: "",
    count: "1",
    minutes: "30",
  });
  const [loadedHabitWeek, setLoadedHabitWeek] = useState<string | null>(null);
  const loadController = useRef<AbortController | null>(null);

  useEffect(() => {
    setReviewText(
      localStorage.getItem(`weekly-review-${weekStart}`) ?? "",
    );
    const storageKey = `weekly-daily-habit-checks-${weekStart}`;
    const habitsStorageKey = `weekly-daily-habits-${weekStart}`;
    const legacyKey = "weekly-daily-habit-checks";
    const legacySaved = localStorage.getItem(legacyKey);
    let saved = localStorage.getItem(storageKey);
    if (legacySaved && !saved) {
      localStorage.setItem(storageKey, legacySaved);
      saved = legacySaved;
    }
    localStorage.removeItem(legacyKey);
    let habits = DAILY_HABIT_TEMPLATE;
    try {
      const savedHabits = localStorage.getItem(habitsStorageKey);
      habits = normalizeDailyHabits(
        savedHabits ? JSON.parse(savedHabits) : null,
      );
    } catch {
      habits = DAILY_HABIT_TEMPLATE;
    }
    setDailyHabits(habits);
    try {
      const parsed = saved ? (JSON.parse(saved) as Record<string, boolean[]>) : null;
      setDailyHabitChecks(
        parsed && typeof parsed === "object"
          ? parsed
          : createEmptyDailyChecks(habits),
      );
    } catch {
      setDailyHabitChecks(createEmptyDailyChecks(habits));
    }
    setLoadedHabitWeek(weekStart);
  }, [weekStart]);

  useEffect(() => {
    localStorage.setItem(`weekly-review-${weekStart}`, reviewText);
  }, [weekStart, reviewText]);

  useEffect(() => {
    if (loadedHabitWeek !== weekStart) return;
    localStorage.setItem(
      `weekly-daily-habit-checks-${weekStart}`,
      JSON.stringify(dailyHabitChecks),
    );
  }, [dailyHabitChecks, loadedHabitWeek, weekStart]);

  useEffect(() => {
    if (loadedHabitWeek !== weekStart) return;
    localStorage.setItem(
      `weekly-daily-habits-${weekStart}`,
      JSON.stringify(dailyHabits),
    );
  }, [dailyHabits, loadedHabitWeek, weekStart]);

  const diaryMap = useMemo(() => {
    const map = new Map<string, WeeklyDiary>();
    for (const diary of data.diaries) {
      map.set(diary.date, diary);
    }
    return map;
  }, [data.diaries]);

  const monthTitle = useMemo(() => getMonthTitle(calendarMonth), [calendarMonth]);
  const monthGrid = useMemo(() => getMonthGrid(calendarMonth), [calendarMonth]);
  const weekNumbers = useMemo(() => {
    const rows: string[] = [];
    for (let index = 0; index < monthGrid.length; index += 7) {
      rows.push(`W${getWeekNumber(monthGrid[index].date)}`);
    }
    return rows;
  }, [monthGrid]);
  const selectedWeekDates = useMemo(() => {
    const dates = new Set<string>();
    for (let index = 0; index < 7; index += 1) {
      dates.add(addDays(weekStart, index));
    }
    return dates;
  }, [weekStart]);
  const selectedWeekRowIndex = useMemo(() => {
    const index = monthGrid.findIndex((cell) =>
      selectedWeekDates.has(cell.date),
    );
    return index >= 0 ? Math.floor(index / 7) : -1;
  }, [monthGrid, selectedWeekDates]);
  const completedTaskIds = useMemo(
    () =>
      new Set(
        data.records
          .filter((record) => record.completed === 1)
          .map((record) => record.scheduleTaskId),
      ),
    [data.records],
  );
  const totalEstimatedMinutes = useMemo(
    () =>
      data.tasks.reduce(
        (total, task) => total + (task.estimatedDuration || 0),
        0,
      ),
    [data.tasks],
  );
  const totalDailyHabitMinutes = useMemo(
    () =>
      dailyHabits.reduce(
        (total, habit) => total + habit.count * habit.minutes,
        0,
      ),
    [dailyHabits],
  );
  const forceDurationMinutes = useMemo(
    () =>
      data.records
        .filter((record) => record.completed === 1)
        .reduce((total, record) => total + (record.actualDuration || 0), 0),
    [data.records],
  );
  const durationStats = useMemo(
    () => [
      { key: "total", label: "Total", value: 7 * 60 * 7 },
      {
        key: "schedule",
        label: "Schedule",
        value: totalEstimatedMinutes + totalDailyHabitMinutes,
      },
      {
        key: "force",
        label: "Force",
        value: forceDurationMinutes,
      },
    ],
    [totalEstimatedMinutes, totalDailyHabitMinutes, forceDurationMinutes],
  );
  const pieOption = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: "item",
        formatter: (params: any) =>
          `${params.name}: ${params.value} (${params.percent}%)`,
      },
      series: [
        {
          type: "pie" as const,
          radius: ["58%", "82%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: false,
          label: { show: false },
          emphasis: { scaleSize: 4 },
          color: ["#22a06b", "#e5e7eb"],
          data: [
            {
              name: "已完成",
              value: data.completedTasks,
            },
            {
              name: "未完成",
              value: Math.max(0, data.totalTasks - data.completedTasks),
            },
          ],
        },
      ],
    }),
    [data.completedTasks, data.totalTasks],
  );

  async function loadWeek(nextStart: string) {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      const response = await fetch(
        `/api/weekly?weekStart=${encodeURIComponent(nextStart)}`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return false;
      if (response.status === 401) {
        window.location.href = "/login";
        return false;
      }
      if (!response.ok) {
        window.alert(await getResponseError(response, "加载周计划失败"));
        return false;
      }
      const nextData = (await response.json()) as WeeklyData;
      if (controller.signal.aborted) return false;
      const nextSelectedDate =
        nextData.days.find((day) => day.isToday)?.date ?? nextData.weekStart;
      setData(nextData);
      setWeekStart(nextData.weekStart);
      setSelectedDate(nextSelectedDate);
      setCalendarMonth(nextSelectedDate);
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(error);
        window.alert("加载周计划失败");
      }
      return false;
    } finally {
      if (loadController.current === controller) {
        loadController.current = null;
      }
    }
  }

  async function navigateWeek(delta: number) {
    await loadWeek(addDays(weekStart, delta * 7));
  }

  async function goCurrentWeek() {
    await loadWeek(getWeekStart(getToday()));
  }

  async function goToDate(date: string) {
    const nextWeekStart = getWeekStart(date);
    if (nextWeekStart !== weekStart) {
      if (!(await loadWeek(nextWeekStart))) return;
    } else {
      loadController.current?.abort();
    }
    setSelectedDate(date);
    setCalendarMonth(date);
  }

  function shiftCalendarMonth(delta: number) {
    setCalendarMonth(shiftMonth(calendarMonth, delta));
  }

  async function handleSaveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = scheduleForm.title.trim();
    if (!title) return;
    const response = await fetch(
      editingTaskId
        ? `/api/weekly/tasks/${editingTaskId}`
        : "/api/weekly/tasks",
      {
        method: editingTaskId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          title,
          estimatedDuration: Number(scheduleForm.estimatedDuration || 0),
          taskType: scheduleForm.taskType,
          category: scheduleForm.category,
        }),
      },
    );
    if (!response.ok) {
      window.alert(
        await getResponseError(
          response,
          editingTaskId ? "保存任务失败" : "添加任务失败",
        ),
      );
      return;
    }
    setScheduleModalOpen(false);
    setEditingTaskId(null);
    resetScheduleForm();
    await loadWeek(weekStart);
  }

  async function handleDeleteTask(task: WeeklyTask) {
    if (
      !window.confirm(
        `确定删除任务“${task.title}”吗？相关每日记录也会一并删除。`,
      )
    ) {
      return;
    }
    const response = await fetch(`/api/weekly/tasks/${task.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert(await getResponseError(response, "删除任务失败"));
      return;
    }
    await loadWeek(weekStart);
  }

  function openScheduleModal(task?: WeeklyTask) {
    setEditingTaskId(task?.id ?? null);
    setScheduleForm(
      task
        ? {
            title: task.title,
            estimatedDuration: String(task.estimatedDuration || ""),
            taskType: task.taskType,
            category: task.category,
          }
        : {
            title: "",
            estimatedDuration: "",
            taskType: "once",
            category: "work",
          },
    );
    setScheduleModalOpen(true);
  }

  function resetScheduleForm() {
    setScheduleForm({
      title: "",
      estimatedDuration: "",
      taskType: "once",
      category: "work",
    });
  }

  function closeScheduleModal() {
    setScheduleModalOpen(false);
    setEditingTaskId(null);
    resetScheduleForm();
  }

  async function handleDayAddTask(date: string, scheduleTaskId: string) {
    const response = await fetch("/api/weekly/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleTaskId,
        weekStart,
        date,
        actualDuration: 0,
      }),
    });
    if (!response.ok) {
      window.alert(
        await getResponseError(response, "添加每日记录失败"),
      );
      return;
    }
    await loadWeek(weekStart);
    setDayTaskMenuOpen((current) => ({
      ...current,
      [date]: false,
    }));
  }

  async function handleUpdateRecord(
    record: WeeklyRecord,
    patch: { actualDuration?: number; completed?: boolean },
  ) {
    const response = await fetch(`/api/weekly/records/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      window.alert(
        await getResponseError(response, "更新每日记录失败"),
      );
      return;
    }
    await loadWeek(weekStart);
  }

  async function handleDeleteRecord(record: WeeklyRecord) {
    const response = await fetch(`/api/weekly/records/${record.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert(
        await getResponseError(response, "删除每日记录失败"),
      );
      return;
    }
    await loadWeek(weekStart);
  }

  async function handleSaveDiary(
    event: FocusEvent<HTMLTextAreaElement>,
    date: string,
  ) {
    const response = await fetch("/api/weekly/diary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekStart,
        date,
        content: event.target.value,
      }),
    });
    if (!response.ok) {
      window.alert(await getResponseError(response, "保存日记失败"));
      return;
    }
    setDiaryDrafts((current) => {
      const next = { ...current };
      delete next[date];
      return next;
    });
    await loadWeek(weekStart);
  }

  function resetDailyHabitForm() {
    setDailyHabitForm({
      name: "",
      count: "1",
      minutes: "30",
    });
  }

  function closeDailyHabitForm() {
    setDailyHabitFormOpen(false);
    resetDailyHabitForm();
  }

  function handleAddDailyHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = dailyHabitForm.name.trim();
    if (!name) return;
    if (dailyHabits.some((habit) => habit.name === name)) {
      window.alert("该习惯已存在");
      return;
    }
    const count = Math.max(0, Number(dailyHabitForm.count) || 0);
    const minutes = Math.max(0, Number(dailyHabitForm.minutes) || 0);
    const nextHabits = [...dailyHabits, { name, count, minutes }];
    setDailyHabits(nextHabits);
    setDailyHabitChecks((current) => ({
      ...current,
      [name]: Array.from({ length: 7 }, () => false),
    }));
    closeDailyHabitForm();
  }

  function handleDeleteDailyHabit(name: string) {
    if (!window.confirm(`确定删除习惯“${name}”吗？`)) return;
    setDailyHabits((current) => current.filter((habit) => habit.name !== name));
    setDailyHabitChecks((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handleUpdateDailyHabitMetric(
    name: string,
    field: "count" | "minutes",
    value: string,
  ) {
    const numeric = Math.max(0, Number(value) || 0);
    setDailyHabits((current) =>
      current.map((habit) =>
        habit.name === name ? { ...habit, [field]: numeric } : habit,
      ),
    );
  }

  return (
    <>
      <div className="weekly-header">
        <div>
          <h2>Weekly Plan</h2>
          <p>本周：{data.weekStart} 至 {addDays(data.weekStart, 6)}</p>
        </div>
        <div className="weekly-nav">
          <button className="ghost-button" onClick={() => navigateWeek(-1)}>
            上一周
          </button>
          <button className="primary-button" onClick={goCurrentWeek}>
            本周
          </button>
          <button className="ghost-button" onClick={() => navigateWeek(1)}>
            下一周
          </button>
        </div>
      </div>

      <div className="weekly-layout">
        <div className="weekly-main">
          <section className="card weekly-plan-card">
            <h3 className="weekly-card-title">Schedule</h3>
            <div className="weekly-plan-list">
              {data.tasks.map((task) => {
                const taskCompleted = completedTaskIds.has(task.id);
                return (
                  <div
                    className={`weekly-plan-item ${taskCompleted ? "done" : ""}`}
                    key={task.id}
                  >
                    <span>{task.title}</span>
                    <small>
                      {task.estimatedDuration || "-"} min ·{" "}
                      {TASK_TYPE_LABELS[task.taskType]} ·{" "}
                      {TASK_CATEGORY_LABELS[task.category]}
                    </small>
                    <div className="weekly-plan-item-actions">
                      <button
                        className="weekly-plan-action"
                        type="button"
                        onClick={() => openScheduleModal(task)}
                      >
                        编辑
                      </button>
                      <button
                        className="weekly-plan-action danger"
                        type="button"
                        onClick={() => handleDeleteTask(task)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                className="weekly-plan-add-card"
                type="button"
                onClick={() => openScheduleModal()}
              >
                ＋ New Task
              </button>
            </div>
            <div className="weekly-plan-summary">
              <span>总计 {data.tasks.length} tasks</span>
              <span>总时长 {totalEstimatedMinutes} min</span>
            </div>
          </section>

          <div className="weekly-days">
            {data.days.map((day) => {
              const records = data.records.filter(
                (record) => record.date === day.date,
              );
              const availableTasks = data.tasks.filter(
                (task) => {
                  const alreadyOnDate = data.records.some(
                    (record) =>
                      record.date === day.date &&
                      record.scheduleTaskId === task.id,
                  );
                  if (alreadyOnDate) return false;
                  if (task.taskType === "daily") return true;
                  return !data.records.some(
                    (record) => record.scheduleTaskId === task.id,
                  );
                },
              );
              const diary = diaryMap.get(day.date);
              return (
                <div
                  className={`weekly-day-row ${day.date === today ? "today" : ""}`}
                  key={day.date}
                >
                  <section className="card weekly-day-tasks">
                    <div className="weekly-day-title">
                      <strong>{day.label}</strong>
                      <span>{formatShortDate(day.date)}</span>
                    </div>
                    <div className="weekly-day-task-list">
                      {records.map((record) => {
                        const task = data.tasks.find(
                          (item) => item.id === record.scheduleTaskId,
                        );
                        if (!task || !task.title.trim()) return null;
                        return (
                          <div
                            className={`weekly-task-item ${record.completed ? "done" : ""}`}
                            key={record.id}
                          >
                            <input
                              type="checkbox"
                              checked={record.completed === 1}
                              onChange={(event) =>
                                handleUpdateRecord(record, {
                                  completed: event.target.checked,
                                })
                              }
                            />
                            <span className="weekly-task-title">
                              {task.title}
                            </span>
                            <input
                              className="weekly-task-time"
                              type="number"
                              min="0"
                              step="1"
                              value={
                                recordDurations[record.id] ??
                                (record.actualDuration
                                  ? String(record.actualDuration)
                                  : "")
                              }
                              placeholder="min"
                              aria-label="实际时长（分钟）"
                              onChange={(event) =>
                                setRecordDurations((current) => ({
                                  ...current,
                                  [record.id]: event.target.value,
                                }))
                              }
                              onBlur={(event) => {
                                const value = event.target.value;
                                if (value === "") {
                                  void handleUpdateRecord(record, {
                                    actualDuration: 0,
                                  });
                                  return;
                                }
                                const duration = Number(value);
                                if (
                                  !Number.isFinite(duration) ||
                                  duration < 0
                                ) {
                                  setRecordDurations((current) => ({
                                    ...current,
                                    [record.id]: record.actualDuration
                                      ? String(record.actualDuration)
                                      : "",
                                  }));
                                  return;
                                }
                                void handleUpdateRecord(record, {
                                  actualDuration: duration,
                                });
                              }}
                            />
                            <button
                              className="weekly-task-delete"
                              onClick={() => handleDeleteRecord(record)}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="weekly-day-add">
                      <button
                        className="weekly-day-add-trigger"
                        type="button"
                        disabled={availableTasks.length === 0}
                        aria-expanded={Boolean(dayTaskMenuOpen[day.date])}
                        onClick={() =>
                          setDayTaskMenuOpen((current) => ({
                            ...current,
                            [day.date]: !current[day.date],
                          }))
                        }
                      >
                        {dayTaskMenuOpen[day.date] ? "收起" : "＋ 添加"}
                      </button>
                      {dayTaskMenuOpen[day.date] &&
                        availableTasks.length > 0 && (
                        <div className="weekly-day-add-menu">
                          {availableTasks.map((task) => (
                            <button
                              className="weekly-day-add-option"
                              type="button"
                              key={task.id}
                              onClick={() =>
                                void handleDayAddTask(day.date, task.id)
                              }
                            >
                              {task.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="card weekly-day-diary">
                    <textarea
                      value={diaryDrafts[day.date] ?? diary?.content ?? ""}
                      placeholder="记录今天…"
                      onChange={(event) =>
                        setDiaryDrafts((current) => ({
                          ...current,
                          [day.date]: event.target.value,
                        }))
                      }
                      onBlur={(event) => handleSaveDiary(event, day.date)}
                    />
                  </section>
                </div>
              );
            })}
          </div>

          <section className="card weekly-review-card">
            <h3 className="weekly-card-title">Review</h3>
            <textarea
              value={reviewText}
              placeholder="写一下本周回顾…"
              onChange={(event) => setReviewText(event.target.value)}
            />
          </section>
        </div>

        <aside className="weekly-side">
          <section className="card weekly-calendar-card">
            <div className="month-calendar">
              <div className="month-calendar-title">
                <button
                  className="month-calendar-nav"
                  type="button"
                  aria-label="上个月"
                  onClick={() => shiftCalendarMonth(-1)}
                >
                  ‹
                </button>
                <span>{monthTitle}</span>
                <button
                  className="month-calendar-nav"
                  type="button"
                  aria-label="下个月"
                  onClick={() => shiftCalendarMonth(1)}
                >
                  ›
                </button>
              </div>
              <div className="month-calendar-body">
                <div className="month-calendar-week-numbers">
                  <div
                    className="month-calendar-week-number-spacer"
                    aria-hidden="true"
                  />
                  {weekNumbers.map((week, index) => (
                    <div
                      className={`month-calendar-week-number ${
                        index === selectedWeekRowIndex
                          ? "is-current-week"
                          : ""
                      }`}
                      key={`${week}-${index}`}
                    >
                      {week}
                    </div>
                  ))}
                </div>
                <div className="month-calendar-weeks">
                  <div className="month-calendar-weekdays">
                    {["一", "二", "三", "四", "五", "六", "日"].map(
                      (label) => (
                        <span key={label}>{label}</span>
                      ),
                    )}
                  </div>
                  <div className="month-calendar-grid">
                    {Array.from({ length: 6 }, (_, rowIndex) => (
                      <div
                        className={`month-calendar-week-row ${
                          rowIndex === selectedWeekRowIndex
                            ? "is-current-week"
                            : ""
                        }`}
                        key={rowIndex}
                      >
                        {monthGrid
                          .slice(rowIndex * 7, rowIndex * 7 + 7)
                          .map((cell) => (
                            <button
                              key={cell.date}
                              className={`month-calendar-cell ${
                                cell.inMonth ? "" : "outside"
                              } ${
                                selectedWeekDates.has(cell.date)
                                  ? "week-selected"
                                  : ""
                              } ${
                                cell.date === selectedDate
                                  ? "selected"
                                  : ""
                              } ${cell.date === today ? "today" : ""}`}
                              onClick={() => void goToDate(cell.date)}
                            >
                              {cell.day}
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card weekly-status-card">
            <h3 className="weekly-card-title">Completed Status</h3>
            <div className="weekly-status-chart">
              <EChart option={pieOption} height={170} />
              <div className="weekly-status-overlay">
                <b>{data.completionRate}%</b>
                <span>
                  {data.completedTasks} / {data.totalTasks}
                </span>
              </div>
            </div>
          </section>

          <section className="card weekly-daily-habit-card">
            <div className="weekly-daily-habit-header">
              <h3 className="weekly-card-title">Daily Habit</h3>
              <button
                className="daily-habit-add-button"
                type="button"
                aria-label="新增习惯"
                onClick={() => setDailyHabitFormOpen(true)}
              >
                ＋
              </button>
            </div>
            {dailyHabitFormOpen && (
              <form
                className="daily-habit-form"
                onSubmit={handleAddDailyHabit}
              >
                <input
                  value={dailyHabitForm.name}
                  onChange={(event) =>
                    setDailyHabitForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="习惯名称"
                  required
                />
                <div className="daily-habit-form-row">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={dailyHabitForm.count}
                    onChange={(event) =>
                      setDailyHabitForm((current) => ({
                        ...current,
                        count: event.target.value,
                      }))
                    }
                    placeholder="次数"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={dailyHabitForm.minutes}
                    onChange={(event) =>
                      setDailyHabitForm((current) => ({
                        ...current,
                        minutes: event.target.value,
                      }))
                    }
                    placeholder="分钟"
                  />
                </div>
                <div className="daily-habit-form-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={closeDailyHabitForm}
                  >
                    取消
                  </button>
                  <button className="primary-button" type="submit">
                    添加
                  </button>
                </div>
              </form>
            )}
            <div className="weekly-daily-habit-scroll">
              <div className="daily-habit-table">
                <div className="daily-habit-head habit">HABIT</div>
                <div className="daily-habit-head">Cnt</div>
                <div className="daily-habit-head">Time(m)</div>
                {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
                  <div className="daily-habit-head" key={label}>
                    {label}
                  </div>
                ))}
                <div className="daily-habit-head">Prog</div>

                {dailyHabits.map((habit) => {
                  const checks = dailyHabitChecks[habit.name] ?? [];
                  const completed = checks.filter(Boolean).length;
                  const progress = Math.round((completed / 7) * 100);
                  return [
                    <div
                      className="daily-habit-cell habit"
                      key={`${habit.name}-name`}
                    >
                      <span className="daily-habit-name">{habit.name}</span>
                      <button
                        className="daily-habit-delete"
                        type="button"
                        aria-label={`删除 ${habit.name}`}
                        onClick={() => handleDeleteDailyHabit(habit.name)}
                      >
                        ×
                      </button>
                    </div>,
                    <div className="daily-habit-cell" key={`${habit.name}-cnt`}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={habit.count}
                        aria-label={`${habit.name} 每周次数`}
                        onChange={(event) =>
                          handleUpdateDailyHabitMetric(
                            habit.name,
                            "count",
                            event.target.value,
                          )
                        }
                      />
                    </div>,
                    <div className="daily-habit-cell" key={`${habit.name}-time`}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={habit.minutes}
                        aria-label={`${habit.name} 每次时长`}
                        onChange={(event) =>
                          handleUpdateDailyHabitMetric(
                            habit.name,
                            "minutes",
                            event.target.value,
                          )
                        }
                      />
                    </div>,
                    ...Array.from({ length: 7 }, (_, index) => (
                      <div className="daily-habit-cell" key={`${habit.name}-${index}`}>
                        <input
                          type="checkbox"
                          checked={checks[index] ?? false}
                          onChange={(event) => {
                            const current = [...(checks ?? [])];
                            current[index] = event.target.checked;
                            setDailyHabitChecks((all) => ({
                              ...all,
                              [habit.name]: current,
                            }));
                          }}
                        />
                      </div>
                    )),
                    <div
                      className="daily-habit-cell progress"
                      key={`${habit.name}-progress`}
                    >
                      {progress}%
                    </div>,
                  ];
                })}
              </div>
            </div>
            <div className="daily-habit-summary">
              总时长 {totalDailyHabitMinutes} min
            </div>
          </section>

          <section className="card weekly-duration-card">
            <h3 className="weekly-card-title">Duration Stats</h3>
            <div className="duration-stat-list">
              {durationStats.map((stat) => {
                const percent = Math.round(
                  (stat.value / durationStats[0].value) * 100,
                );
                const width = Math.min(100, percent);
                return (
                  <div className="duration-stat-item" key={stat.key}>
                    <div className="duration-stat-header">
                      <span>{stat.label}</span>
                      <strong>
                        {formatDuration(stat.value)} · {percent}%
                      </strong>
                    </div>
                    <div className="duration-stat-track">
                      <div
                        className={`duration-stat-fill ${stat.key}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>

      {scheduleModalOpen && (
        <div className="habit-modal-overlay" onClick={closeScheduleModal}>
          <div
            className="habit-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="card-title">
              <h2>{editingTaskId ? "Edit Task" : "New Task"}</h2>
              <button
                className="habit-modal-close"
                onClick={closeScheduleModal}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <form className="schedule-modal-form" onSubmit={handleSaveTask}>
              <label>
                Task Name
                <input
                  value={scheduleForm.title}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="例如：背诵《心经》"
                  required
                />
              </label>
              <label>
                Estimated Duration
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={scheduleForm.estimatedDuration}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      estimatedDuration: event.target.value,
                    }))
                  }
                  placeholder="分钟"
                />
              </label>
              <div className="schedule-modal-row">
                <label>
                  Task Type
                  <select
                    value={scheduleForm.taskType}
                    onChange={(event) =>
                      setScheduleForm((current) => ({
                        ...current,
                        taskType: event.target.value,
                      }))
                    }
                  >
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={scheduleForm.category}
                    onChange={(event) =>
                      setScheduleForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                  >
                    <option value="recitation">背诵</option>
                    <option value="practice">实修</option>
                    <option value="reading">阅读</option>
                    <option value="work">工作</option>
                    <option value="leisure">业余</option>
                  </select>
                </label>
              </div>
              <div className="habit-modal-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={closeScheduleModal}
                >
                  取消
                </button>
                <button className="primary-button" type="submit">
                  {editingTaskId ? "保存修改" : "确认新增"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
