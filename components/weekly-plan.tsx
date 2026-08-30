"use client";

import type { FocusEvent, FormEvent } from "react";
import { useMemo, useState } from "react";
import type {
  WeeklyData,
  WeeklyDiary,
  WeeklyTask,
} from "@/lib/weekly-types";

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

export function WeeklyPlan({ initialData }: { initialData: WeeklyData }) {
  const [data, setData] = useState(initialData);
  const [weekStart, setWeekStart] = useState(initialData.weekStart);
  const today = getToday();
  const [selectedDate, setSelectedDate] = useState(
    initialData.days.find((day) => day.isToday)?.date ??
      initialData.weekStart,
  );
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [dayTaskDrafts, setDayTaskDrafts] = useState<Record<string, string>>({});
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({});
  const [diaryDrafts, setDiaryDrafts] = useState<Record<string, string>>({});

  const diaryMap = useMemo(() => {
    const map = new Map<string, WeeklyDiary>();
    for (const diary of data.diaries) {
      map.set(diary.date, diary);
    }
    return map;
  }, [data.diaries]);

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
    const title = newTaskTitle.trim();
    if (!title) return;
    const response = await fetch("/api/weekly/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekStart,
        date: selectedDate,
        title,
      }),
    });
    if (!response.ok) {
      window.alert("添加任务失败");
      return;
    }
    setNewTaskTitle("");
    await loadWeek(weekStart);
  }

  async function handleDayAddTask(
    event: FormEvent<HTMLFormElement>,
    date: string,
  ) {
    event.preventDefault();
    const title = (dayTaskDrafts[date] ?? "").trim();
    if (!title) return;
    const response = await fetch("/api/weekly/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart, date, title }),
    });
    if (!response.ok) {
      window.alert("添加任务失败");
      return;
    }
    setDayTaskDrafts((current) => {
      const next = { ...current };
      delete next[date];
      return next;
    });
    await loadWeek(weekStart);
  }

  async function handleUpdateTask(
    task: WeeklyTask,
    patch: { title?: string; actualTime?: string; completed?: boolean },
  ) {
    const response = await fetch(`/api/weekly/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      window.alert("更新任务失败");
      return;
    }
    await loadWeek(weekStart);
  }

  async function handleDeleteTask(task: WeeklyTask) {
    if (!window.confirm(`确定删除“${task.title}”吗？`)) return;
    const response = await fetch(`/api/weekly/tasks/${task.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert("删除任务失败");
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

      <div className="weekly-overview">
        <section className="card weekly-calendar-card">
          <h3 className="weekly-card-title">Calendar</h3>
          <div className="weekly-calendar">
            {data.days.map((day) => (
              <button
                key={day.date}
                className={`weekly-calendar-day ${
                  selectedDate === day.date ? "selected" : ""
                } ${day.date === today ? "today" : ""}`}
                onClick={() => setSelectedDate(day.date)}
              >
                <span>{day.label}</span>
                <strong>{day.date.slice(8)}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="card weekly-plan-card">
          <h3 className="weekly-card-title">Weekly Plan · Todo List</h3>
          <form className="weekly-add-form" onSubmit={handleAddTask}>
            <input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="添加本周任务"
            />
            <select
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            >
              {data.days.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label} {day.date.slice(8)}
                </option>
              ))}
            </select>
            <button className="primary-button" type="submit">
              添加
            </button>
          </form>
          <div className="weekly-plan-list">
            {data.tasks.map((task) => (
              <div
                className={`weekly-plan-item ${task.completed ? "done" : ""}`}
                key={task.id}
              >
                <input
                  type="checkbox"
                  checked={task.completed === 1}
                  onChange={(event) =>
                    handleUpdateTask(task, {
                      completed: event.target.checked,
                    })
                  }
                />
                <span>{task.title}</span>
                <small>{task.date.slice(8)}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="card weekly-status-card">
          <h3 className="weekly-card-title">Completed Status</h3>
          <div className="weekly-status-number">{data.completionRate}%</div>
          <div className="weekly-status-detail">
            已完成 {data.completedTasks} / {data.totalTasks}
          </div>
          <div className="weekly-status-bar">
            <span style={{ width: `${data.completionRate}%` }} />
          </div>
        </section>
      </div>

      <div className="weekly-days">
        {data.days.map((day) => {
          const tasks = data.tasks.filter((task) => task.date === day.date);
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
                  {tasks.length === 0 ? (
                    <div className="weekly-empty">暂无任务</div>
                  ) : (
                    tasks.map((task) => (
                      <div
                        className={`weekly-task-item ${task.completed ? "done" : ""}`}
                        key={task.id}
                      >
                        <input
                          type="checkbox"
                          checked={task.completed === 1}
                          onChange={(event) =>
                            handleUpdateTask(task, {
                              completed: event.target.checked,
                            })
                          }
                        />
                        <span className="weekly-task-title">{task.title}</span>
                        <input
                          className="weekly-task-time"
                          value={
                            timeDrafts[task.id] ?? task.actualTime
                          }
                          placeholder="actual time"
                          onChange={(event) =>
                            setTimeDrafts((current) => ({
                              ...current,
                              [task.id]: event.target.value,
                            }))
                          }
                          onBlur={(event) =>
                            handleUpdateTask(task, {
                              actualTime: event.target.value,
                            })
                          }
                        />
                        <button
                          className="weekly-task-delete"
                          onClick={() => handleDeleteTask(task)}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <form
                  className="weekly-day-add"
                  onSubmit={(event) => handleDayAddTask(event, day.date)}
                >
                  <input
                    value={dayTaskDrafts[day.date] ?? ""}
                    onChange={(event) =>
                      setDayTaskDrafts((current) => ({
                        ...current,
                        [day.date]: event.target.value,
                      }))
                    }
                    placeholder="添加当天任务"
                  />
                  <button className="primary-button" type="submit">
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
                  value={
                    diaryDrafts[day.date] ?? diary?.content ?? ""
                  }
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
    </>
  );
}
