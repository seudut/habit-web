"use client";

import type { FocusEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
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

const DAILY_HABIT_TEMPLATE = [
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

function createEmptyDailyChecks() {
  return Object.fromEntries(
    DAILY_HABIT_TEMPLATE.map((habit) => [
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
  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    estimatedDuration: "",
    taskType: "once",
    category: "work",
  });
  const [dayTaskSelections, setDayTaskSelections] = useState<Record<string, string>>({});
  const [recordDurations, setRecordDurations] = useState<Record<string, string>>({});
  const [diaryDrafts, setDiaryDrafts] = useState<Record<string, string>>({});
  const [reviewText, setReviewText] = useState("");
  const [dailyHabitChecks, setDailyHabitChecks] = useState<
    Record<string, boolean[]>
  >({});

  useEffect(() => {
    setReviewText(
      localStorage.getItem(`weekly-review-${weekStart}`) ?? "",
    );
    const saved = localStorage.getItem("weekly-daily-habit-checks");
    if (saved) {
      setDailyHabitChecks(JSON.parse(saved));
    } else {
      setDailyHabitChecks(createEmptyDailyChecks());
    }
  }, [weekStart]);

  useEffect(() => {
    localStorage.setItem(`weekly-review-${weekStart}`, reviewText);
  }, [weekStart, reviewText]);

  useEffect(() => {
    localStorage.setItem("weekly-daily-habit-checks", JSON.stringify(dailyHabitChecks));
  }, [dailyHabitChecks]);

  const diaryMap = useMemo(() => {
    const map = new Map<string, WeeklyDiary>();
    for (const diary of data.diaries) {
      map.set(diary.date, diary);
    }
    return map;
  }, [data.diaries]);

  const monthTitle = useMemo(() => getMonthTitle(selectedDate), [selectedDate]);
  const monthGrid = useMemo(() => getMonthGrid(selectedDate), [selectedDate]);
  const selectedWeekDates = useMemo(() => {
    const dates = new Set<string>();
    for (let index = 0; index < 7; index += 1) {
      dates.add(addDays(weekStart, index));
    }
    return dates;
  }, [weekStart]);
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
    const response = await fetch(`/api/weekly?weekStart=${nextStart}`, {
      cache: "no-store",
    });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) {
      window.alert("加载周计划失败");
      return;
    }
    const nextData = (await response.json()) as WeeklyData;
    setData(nextData);
    setWeekStart(nextData.weekStart);
    setSelectedDate(
      nextData.days.find((day) => day.isToday)?.date ?? nextData.weekStart,
    );
  }

  async function navigateWeek(delta: number) {
    await loadWeek(addDays(weekStart, delta * 7));
  }

  async function goCurrentWeek() {
    const current = new Date();
    const day = current.getDay();
    const offset = day === 0 ? 6 : day - 1;
    current.setDate(current.getDate() - offset);
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const date = String(current.getDate()).padStart(2, "0");
    await loadWeek(`${year}-${month}-${date}`);
  }

  async function handleAddTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = scheduleForm.title.trim();
    if (!title) return;
    const response = await fetch("/api/weekly/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekStart,
        title,
        estimatedDuration: Number(scheduleForm.estimatedDuration || 0),
        taskType: scheduleForm.taskType,
        category: scheduleForm.category,
      }),
    });
    if (!response.ok) {
      window.alert("添加任务失败");
      return;
    }
    setScheduleModalOpen(false);
    setScheduleForm({
      title: "",
      estimatedDuration: "",
      taskType: "once",
      category: "work",
    });
    await loadWeek(weekStart);
  }

  async function handleDayAddTask(
    event: FormEvent<HTMLFormElement>,
    date: string,
  ) {
    event.preventDefault();
    const scheduleTaskId = dayTaskSelections[date];
    if (!scheduleTaskId) return;
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
      window.alert("添加每日记录失败");
      return;
    }
    setDayTaskSelections((current) => {
      const next = { ...current };
      delete next[date];
      return next;
    });
    await loadWeek(weekStart);
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
      window.alert("更新每日记录失败");
      return;
    }
    await loadWeek(weekStart);
  }

  async function handleDeleteRecord(record: WeeklyRecord) {
    const response = await fetch(`/api/weekly/records/${record.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert("删除每日记录失败");
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
      window.alert("保存日记失败");
      return;
    }
    setDiaryDrafts((current) => {
      const next = { ...current };
      delete next[date];
      return next;
    });
    await loadWeek(weekStart);
  }

  function openScheduleModal() {
    setScheduleModalOpen(true);
  }

  function closeScheduleModal() {
    setScheduleModalOpen(false);
    setScheduleForm({
      title: "",
      estimatedDuration: "",
      taskType: "once",
      category: "work",
    });
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
            <div className="weekly-plan-toolbar">
              <span>{data.tasks.length} tasks</span>
              <button
                className="primary-button"
                type="button"
                onClick={openScheduleModal}
              >
               ＋ New Task
              </button>
            </div>
            <div className="weekly-plan-list">
              {data.tasks.map((task) => (
                <div className="weekly-plan-item" key={task.id}>
                  <span>{task.title}</span>
                  <small>
                    {task.estimatedDuration || "-"} min ·{" "}
                    {TASK_TYPE_LABELS[task.taskType]} ·{" "}
                    {TASK_CATEGORY_LABELS[task.category]}
                  </small>
                </div>
              ))}
            </div>
          </section>

          <div className="weekly-days">
            {data.days.map((day) => {
              const records = data.records.filter(
                (record) => record.date === day.date,
              );
              const availableTasks = data.tasks.filter(
                (task) =>
                  !data.records.some(
                    (record) =>
                      record.date === day.date &&
                      record.scheduleTaskId === task.id,
                  ),
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
                      <span>{day.date}</span>
                    </div>
                    <div className="weekly-day-task-list">
                      {records.length === 0 ? (
                        <div className="weekly-empty">暂无每日记录</div>
                      ) : (
                        records.map((record) => {
                          const task = data.tasks.find(
                            (item) => item.id === record.scheduleTaskId,
                          );
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
                                {task?.title ?? "未知任务"}
                              </span>
                              <input
                                className="weekly-task-time"
                                value={
                                  recordDurations[record.id] ??
                                  (record.actualDuration
                                    ? String(record.actualDuration)
                                    : "")
                                }
                                placeholder="actual duration"
                                onChange={(event) =>
                                  setRecordDurations((current) => ({
                                    ...current,
                                    [record.id]: event.target.value,
                                  }))
                                }
                                onBlur={(event) =>
                                  handleUpdateRecord(record, {
                                    actualDuration:
                                      Number(event.target.value) || 0,
                                  })
                                }
                              />
                              <button
                                className="weekly-task-delete"
                                onClick={() => handleDeleteRecord(record)}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <form
                      className="weekly-day-add"
                      onSubmit={(event) =>
                        handleDayAddTask(event, day.date)
                      }
                    >
                      <select
                        value={
                          dayTaskSelections[day.date] ??
                          availableTasks[0]?.id ??
                          ""
                        }
                        onChange={(event) =>
                          setDayTaskSelections((current) => ({
                            ...current,
                            [day.date]: event.target.value,
                          }))
                        }
                      >
                        {availableTasks.length === 0 ? (
                          <option value="">暂无可用任务</option>
                        ) : (
                          availableTasks.map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.title}
                            </option>
                          ))
                        )}
                      </select>
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={availableTasks.length === 0}
                      >
                        ＋
                      </button>
                    </form>
                  </section>

                  <section className="card weekly-day-diary">
                    <div className="weekly-day-title">
                      <strong>日记</strong>
                      <span>{day.date}</span>
                    </div>
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
            <h3 className="weekly-card-title">Calendar</h3>
            <div className="month-calendar">
              <div className="month-calendar-title">{monthTitle}</div>
              <div className="month-calendar-weekdays">
                {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="month-calendar-grid">
                {monthGrid.map((cell) => (
                  <button
                    key={cell.date}
                    className={`month-calendar-cell ${
                      cell.inMonth ? "" : "outside"
                    } ${
                      selectedWeekDates.has(cell.date)
                        ? "week-selected"
                        : ""
                    } ${cell.date === today ? "today" : ""}`}
                    onClick={() => {
                      if (selectedWeekDates.has(cell.date)) {
                        setSelectedDate(cell.date);
                      }
                    }}
                  >
                    {cell.day}
                  </button>
                ))}
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
            <h3 className="weekly-card-title">Daily Habit</h3>
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

                {DAILY_HABIT_TEMPLATE.map((habit) => {
                  const checks = dailyHabitChecks[habit.name] ?? [];
                  const completed = checks.filter(Boolean).length;
                  const progress = Math.round((completed / 7) * 100);
                  return [
                    <div
                      className="daily-habit-cell habit"
                      key={`${habit.name}-name`}
                    >
                      {habit.name}
                    </div>,
                    <div className="daily-habit-cell" key={`${habit.name}-cnt`}>
                      {habit.count}
                    </div>,
                    <div className="daily-habit-cell" key={`${habit.name}-time`}>
                      {habit.minutes}
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
          </section>
        </aside>
      </div>

      {scheduleModalOpen && (
        <div className="habit-modal-overlay" onClick={closeScheduleModal}>
          <div
            className="habit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="card-title">
              <h2>New Task</h2>
              <button
                className="habit-modal-close"
                onClick={closeScheduleModal}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <form className="schedule-modal-form" onSubmit={handleAddTask}>
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
                  确认新增
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
