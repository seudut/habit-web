"use client";

import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";
import type {
  Habit,
  HabitUnit,
  MonthData,
  RecordEntry,
} from "@/lib/types";
import {
  formatMinutesAsTime,
  parseTimeToMinutes,
} from "@/lib/scoring";
import { DailyChart } from "./daily-chart";
import { PracticeDurationChart } from "./practice-duration-chart";
import { SleepTimeChart } from "./sleep-time-chart";
import { AppTabs } from "./app-tabs";

const CATEGORY_LABELS: Record<string, string> = {
  sleep: "睡觉",
  practice: "实修",
  reading: "阅读",
};

const CATEGORY_ORDER = ["sleep", "practice", "reading"];

type HabitFormState = {
  name: string;
  category: string;
  unit: HabitUnit;
  target: string;
  color: string;
};

interface DashboardProps {
  initialData: MonthData;
}

function getRecordKey(habitId: string, date: string) {
  return `${habitId}:${date}`;
}

function formatHabitTarget(habit: Habit) {
  if (habit.unit === "time") {
    return formatMinutesAsTime(habit.target);
  }
  if (habit.unit === "boolean") {
    return "1";
  }
  if (habit.unit === "minutes") {
    return `${habit.target} 分钟`;
  }
  return `${habit.target} 次`;
}

function parseHabitValue(habit: Habit, rawValue: string) {
  if (habit.unit === "time") {
    if (!rawValue.trim()) return 0;
    return parseTimeToMinutes(rawValue);
  }
  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function getRecordDisplayValue(
  habit: Habit,
  record: RecordEntry | undefined,
  draft?: string | undefined,
) {
  if (draft !== undefined) return draft;
  if (!record?.value) return "";
  return habit.unit === "time"
    ? formatMinutesAsTime(record.value)
    : String(record.value);
}

function getHabitFormTarget(habit: Habit) {
  if (habit.unit === "time") {
    return formatMinutesAsTime(habit.target);
  }
  if (habit.unit === "boolean") {
    return "";
  }
  return String(habit.target);
}

export function Dashboard({ initialData }: DashboardProps) {
  const [data, setData] = useState(initialData);
  const [year, setYear] = useState(initialData.year);
  const [month, setMonth] = useState(initialData.month);
  const [loading, setLoading] = useState(false);
  const [matrixDrafts, setMatrixDrafts] = useState<Record<string, string>>({});
  const [quickDrafts, setQuickDrafts] = useState<Record<string, string>>({});
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [habitModalOpen, setHabitModalOpen] = useState(false);
  const [habitForm, setHabitForm] = useState<HabitFormState>({
    name: "",
    category: "sleep",
    unit: "minutes",
    target: "",
    color: "#3b82f6",
  });
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const recordMap = useMemo(() => {
    const map = new Map<string, RecordEntry>();
    for (const record of data.records) {
      map.set(getRecordKey(record.habitId, record.date), record);
    }
    return map;
  }, [data.records]);

  const habitGroups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABELS[category],
        habits: data.habits.filter((habit) => habit.category === category),
      })).filter((group) => group.habits.length > 0),
    [data.habits],
  );

  const categoryChartStats = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABELS[category],
        stats: data.habitStats.filter(
          (stat) => stat.category === category && stat.unit !== "boolean",
        ),
      })).filter((group) => group.stats.length > 0),
    [data.habitStats],
  );

  async function refresh(currentYear: number, currentMonth: number) {
    const response = await fetch(
      `/api/month?year=${currentYear}&month=${currentMonth}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error("刷新数据失败");
    }
    setData(await response.json());
  }

  async function navigate(delta: number) {
    let nextYear = year;
    let nextMonth = month + delta;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    setLoading(true);
    setYear(nextYear);
    setMonth(nextMonth);
    try {
      await refresh(nextYear, nextMonth);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function goToday() {
    const currentToday = data.today;
    const currentYear = Number(currentToday.slice(0, 4));
    const currentMonth = Number(currentToday.slice(5, 7));
    setLoading(true);
    setYear(currentYear);
    setMonth(currentMonth);
    try {
      await refresh(currentYear, currentMonth);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveRecord(
    habitId: string,
    date: string,
    completed: boolean,
    value: number,
  ) {
    const response = await fetch("/api/records", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ habitId, date, completed, value }),
    });
    if (!response.ok) {
      throw new Error("保存记录失败");
    }
    await refresh(year, month);
  }

  async function handleToggle(habit: Habit, date: string) {
    const record = recordMap.get(getRecordKey(habit.id, date));
    const completed = !Boolean(record?.completed);
    try {
      await saveRecord(
        habit.id,
        date,
        completed,
        habit.unit === "boolean" ? (completed ? 1 : 0) : record?.value ?? 0,
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function handleMatrixValue(
    habit: Habit,
    date: string,
    rawValue: string,
  ) {
    const value = parseHabitValue(habit, rawValue);
    if (value === null) return;

    try {
      await saveRecord(habit.id, date, value > 0, value);
      setMatrixDrafts((current) => {
        const next = { ...current };
        delete next[getRecordKey(habit.id, date)];
        return next;
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "保存失败");
    }
  }

  function resetHabitForm() {
    setEditingHabitId(null);
    setHabitForm({
      name: "",
      category: "sleep",
      unit: "minutes",
      target: "",
      color: "#3b82f6",
    });
  }

  function openAddHabitModal() {
    resetHabitForm();
    setHabitModalOpen(true);
  }

  function startEditHabit(habit: Habit) {
    setEditingHabitId(habit.id);
    setHabitForm({
      name: habit.name,
      category: habit.category,
      unit: habit.unit,
      target: getHabitFormTarget(habit),
      color: habit.color,
    });
    setHabitModalOpen(true);
  }

  function closeHabitModal() {
    setHabitModalOpen(false);
    resetHabitForm();
  }

  async function handleSaveHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const unit = habitForm.unit;
    const targetRaw = habitForm.target.trim();
    const target =
      unit === "time"
        ? parseTimeToMinutes(targetRaw)
        : unit === "boolean"
          ? 1
          : Number(targetRaw);

    if (target === null || !Number.isFinite(target) || target < 0) {
      window.alert(
        unit === "time"
          ? "请填写有效的时间目标，例如 22:30"
          : "请填写有效的每日目标",
      );
      return;
    }

    const endpoint = editingHabitId
      ? `/api/habits/${editingHabitId}?month=${monthKey}`
      : "/api/habits";
    const response = await fetch(endpoint, {
      method: editingHabitId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: habitForm.name,
        category: habitForm.category,
        unit,
        target,
        color: habitForm.color,
        ...(editingHabitId ? {} : { month: monthKey }),
      }),
    });

    if (!response.ok) {
      window.alert(editingHabitId ? "保存习惯失败" : "添加习惯失败");
      return;
    }

    resetHabitForm();
    setHabitModalOpen(false);
    await refresh(year, month);
  }

  async function handleDeleteHabit(habit: Habit) {
    if (
      !window.confirm(
        `确定仅从 ${year} 年 ${month} 月移除“${habit.name}”吗？其它月份和历史记录不会受影响。`,
      )
    ) {
      return;
    }
    const response = await fetch(`/api/habits/${habit.id}?month=${monthKey}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert("删除失败");
      return;
    }
    if (editingHabitId === habit.id) {
      closeHabitModal();
    }
    await refresh(year, month);
  }

  async function handleClearMonth() {
    if (
      !window.confirm(
        `确定清空 ${year} 年 ${month} 月的所有记录吗？此操作不可撤销。`,
      )
    ) {
      return;
    }
    const response = await fetch(
      `/api/records?month=${monthKey}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      window.alert("清空失败");
      return;
    }
    await refresh(year, month);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `72px 102px 94px repeat(${data.days.length}, minmax(24px, 1fr))`,
  };
  let nextMatrixRow = 2;

  const today = data.today;
  const isCurrentMonth = today.startsWith(monthKey);

  return (
    <>
      <AppTabs active="month" />
      <header className="app-header">
        <div className="app-title">
          <h1>习惯打卡</h1>
          <p>按月记录每日作息，自动汇总完成情况</p>
        </div>
        <div className="month-nav">
          <button
            className="icon-button"
            onClick={() => navigate(-1)}
            aria-label="上一个月"
          >
            ‹
          </button>
          <div className="month-title">
            {year} 年 {month} 月
          </div>
          <button
            className="icon-button"
            onClick={() => navigate(1)}
            aria-label="下一个月"
          >
            ›
          </button>
          <button className="ghost-button" onClick={goToday}>
            回到今天
          </button>
          <button className="danger-button" onClick={handleClearMonth}>
            清空本月
          </button>
          <button className="ghost-button" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </header>

      <div className={`dashboard-grid ${loading ? "loading-overlay" : ""}`}>
        <div className="main-stack">
          <section className="card">
            <div className="card-title">
              <h2>每日总体得分</h2>
              <span className="hint">所有习惯当日归一化得分的平均值</span>
            </div>
            <DailyChart stats={data.dailyStats} />
          </section>

          <section className="card">
            <div className="card-title">
              <h2>月度习惯矩阵</h2>
              <span className="hint">
                矩阵中的每日内容可直接编辑，保存后图表自动刷新
              </span>
            </div>
            {data.habits.length === 0 ? (
              <div className="empty-state">
                还没有习惯，先在右侧添加一个吧。
              </div>
            ) : (
              <div className="matrix-shell">
                <div className="habits-grid" style={gridStyle}>
                  <div
                    className="matrix-corner daily-habit-header"
                    style={{ gridColumn: "1 / span 2" }}
                  >
                    DAILY HABIT
                  </div>
                  <div className="matrix-label goal-header" style={{ gridColumn: 3 }}>
                    GOAL
                  </div>
                  {data.days.map((day) => (
                    <div
                      className={`matrix-day ${
                        day.date === today
                          ? "today"
                          : day.weekday === 0 || day.weekday === 6
                            ? "weekend"
                            : ""
                      }`}
                      key={day.date}
                      title={`${day.date} 周${day.label}`}
                    >
                      <strong>{day.day}</strong>
                      <span>{day.label}</span>
                    </div>
                  ))}

                  {habitGroups.map((group) => {
                    const groupRowStart = nextMatrixRow;
                    nextMatrixRow += group.habits.length;
                    return [
                      <div
                        className="matrix-category"
                        key={`category-${group.category}`}
                        style={{
                          gridColumn: 1,
                          gridRow: `${groupRowStart} / span ${group.habits.length}`,
                        }}
                      >
                        {group.label}
                      </div>,
                      ...group.habits.map((habit, habitIndex) => {
                        const row = groupRowStart + habitIndex;
                        return [
                        <div
                          className="habit-cell"
                          key={`habit-${habit.id}`}
                          style={{ gridColumn: 2, gridRow: row }}
                        >
                          <span
                            className="habit-dot"
                            style={{ background: habit.color }}
                          />
                          <span
                            className="habit-name"
                            title={`${habit.name} · 目标 ${formatHabitTarget(habit)}`}
                          >
                            {habit.name}
                          </span>
                        </div>,
                        <div
                          className="matrix-goal"
                          key={`goal-${habit.id}`}
                          style={{ gridColumn: 3, gridRow: row }}
                        >
                          {formatHabitTarget(habit)}
                        </div>,
                        ...data.days.map((day, dayIndex) => {
                          const record = recordMap.get(
                            getRecordKey(habit.id, day.date),
                          );
                          const isWeekend =
                            day.weekday === 0 || day.weekday === 6;
                          if (habit.unit === "boolean") {
                            return (
                              <div
                                className={`matrix-cell ${
                                  isWeekend ? "weekend" : ""
                                }`}
                                key={`${habit.id}-${day.date}`}
                                style={{
                                  gridColumn: 4 + dayIndex,
                                  gridRow: row,
                                }}
                                title={`${day.date} ${record?.completed ? "已完成" : "未完成"}`}
                              >
                                <input
                                  className="matrix-checkbox"
                                  type="checkbox"
                                  checked={record?.completed === 1}
                                  onChange={() => handleToggle(habit, day.date)}
                                  aria-label={`${day.date} ${habit.name}`}
                                />
                              </div>
                            );
                          }

                          const key = getRecordKey(habit.id, day.date);
                          const draft = matrixDrafts[key];
                          const value = getRecordDisplayValue(
                            habit,
                            record,
                            draft,
                          );
                          return (
                            <div
                              className={`matrix-cell ${
                                isWeekend ? "weekend" : ""
                              }`}
                              key={key}
                              style={{
                                gridColumn: 4 + dayIndex,
                                gridRow: row,
                              }}
                              title={`${day.date} · ${value || "未记录"}`}
                            >
                              <input
                                className={
                                  habit.unit === "time"
                                    ? "cell-time"
                                    : "cell-number"
                                }
                                type={
                                  habit.unit === "time" ? "time" : "number"
                                }
                                min={habit.unit === "time" ? undefined : "0"}
                                step={
                                  habit.unit === "time" ? undefined : "1"
                                }
                                value={value}
                                onChange={(event) =>
                                  setMatrixDrafts((current) => ({
                                    ...current,
                                    [key]: event.target.value,
                                  }))
                                }
                                onBlur={(event) =>
                                  handleMatrixValue(
                                    habit,
                                    day.date,
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                          );
                        }),
                        ];
                      }),
                    ];
                  })}
                </div>
              </div>
            )}
          </section>

          {categoryChartStats.map((group) => (
            <section className="card" key={`chart-${group.category}`}>
              <div className="card-title">
                <h2>单项完成情况（图表）（{group.label}）</h2>
                <span className="hint">
                  {group.category === "sleep"
                    ? "纵轴为偏离目标的时长（小时），虚线为目标 0"
                    : group.category === "practice"
                      ? "纵轴为实际时长（分钟），范围 0–120"
                      : "纵轴为实际时长（分钟），范围 0–60"}
                </span>
              </div>
              {group.category === "sleep" ? (
                <SleepTimeChart stats={group.stats} height={280} />
              ) : group.category === "practice" ? (
                <PracticeDurationChart stats={group.stats} height={280} />
              ) : (
                <PracticeDurationChart
                  stats={group.stats}
                  height={280}
                  max={60}
                />
              )}
            </section>
          ))}
        </div>

        <aside className="side-stack">
          <section className="card">
            <div className="card-title">
              <h2>月度总览</h2>
              <span className="hint">综合完成情况</span>
            </div>
            <div className="overview">
              <div
                className="ring"
                style={{ "--rate": data.overall.rate } as CSSProperties}
              >
                <div className="ring-inner">
                  <div className="ring-value">{data.overall.rate}%</div>
                  <div className="ring-label">综合得分</div>
                </div>
              </div>
              <div className="overview-detail">
                <div className="overview-row">
                  <span>达标项</span>
                  <strong>
                    {data.overall.completed} / {data.overall.target}
                  </strong>
                </div>
                <div className="overview-row">
                  <span>连续达标</span>
                  <strong>{data.overall.streak} 天</strong>
                </div>
                <div className="overview-row">
                  <span>完整达标日</span>
                  <strong>{data.overall.perfectDays} 天</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-title">
              <h2>今日打卡</h2>
              {!isCurrentMonth && (
                <button className="ghost-button" onClick={goToday}>
                  回本月
                </button>
              )}
            </div>
            {isCurrentMonth ? (
              <div className="today-list">
                {habitGroups.map((group) => [
                  <div className="today-group" key={`today-${group.category}`}>
                    {group.label}
                  </div>,
                  ...group.habits.map((habit) => {
                    const record = recordMap.get(
                      getRecordKey(habit.id, today),
                    );
                    if (habit.unit === "boolean") {
                      return (
                        <div className="today-item" key={habit.id}>
                          <span
                            className="today-dot"
                            style={{ background: habit.color }}
                          />
                          <span className="today-name">{habit.name}</span>
                          <button
                            className={`check-button ${
                              record?.completed ? "done" : ""
                            }`}
                            onClick={() => handleToggle(habit, today)}
                            aria-label="切换今日完成状态"
                          >
                            ✓
                          </button>
                        </div>
                      );
                    }

                    const key = getRecordKey(habit.id, today);
                    const draft = quickDrafts[key];
                    const value = getRecordDisplayValue(habit, record, draft);
                    return (
                      <div className="today-item" key={habit.id}>
                        <span
                          className="today-dot"
                          style={{ background: habit.color }}
                        />
                        <span className="today-name">
                          <span>{habit.name}</span>
                          <div className="today-target">
                            目标 {formatHabitTarget(habit)}
                          </div>
                        </span>
                        <input
                          className="quick-number"
                          type={habit.unit === "time" ? "time" : "number"}
                          min={habit.unit === "time" ? undefined : "0"}
                          value={value}
                          placeholder={habit.unit === "time" ? "22:30" : "0"}
                          onChange={(event) =>
                            setQuickDrafts((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          onBlur={async (event) => {
                            const parsed = parseHabitValue(
                              habit,
                              event.target.value,
                            );
                            if (parsed === null) return;
                            try {
                              await saveRecord(
                                habit.id,
                                today,
                                parsed > 0,
                                parsed,
                              );
                              setQuickDrafts((current) => {
                                const next = { ...current };
                                delete next[key];
                                return next;
                              });
                            } catch (error) {
                              window.alert(
                                error instanceof Error
                                  ? error.message
                                  : "保存失败",
                              );
                            }
                          }}
                        />
                      </div>
                    );
                  }),
                ])}
              </div>
            ) : (
              <div className="empty-state">
                当前浏览的不是本月，切换回今天即可打卡。
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-title">
              <h2>管理本月习惯</h2>
              <span className="hint">新增、编辑和删除仅影响当前月份</span>
              <button
                className="manager-add-button"
                onClick={openAddHabitModal}
              >
                ＋ 新增
              </button>
            </div>

            <details className="habit-manager-details">
              <summary>
                习惯列表（{data.habits.length}）
                <span className="details-caret">▾</span>
              </summary>
              <div className="habit-manager-list">
                {data.habits.map((habit) => (
                  <div className="habit-manager-item" key={habit.id}>
                    <span
                      className="today-dot"
                      style={{ background: habit.color }}
                    />
                    <div className="habit-manager-name">
                      <strong>{habit.name}</strong>
                      <small>
                        {CATEGORY_LABELS[habit.category]} · 目标{" "}
                        {formatHabitTarget(habit)}
                      </small>
                    </div>
                    <button
                      className="manager-action"
                      onClick={() => startEditHabit(habit)}
                      title="编辑习惯"
                    >
                      编辑
                    </button>
                    <button
                      className="manager-action danger"
                      onClick={() => handleDeleteHabit(habit)}
                      title="删除习惯"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </details>
          </section>
        </aside>
      </div>

      {habitModalOpen && (
        <div className="habit-modal-overlay" onClick={closeHabitModal}>
          <div
            className="habit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="card-title">
              <h2>{editingHabitId ? "编辑习惯" : "新增习惯"}</h2>
              <button
                className="habit-modal-close"
                onClick={closeHabitModal}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <form className="quick-form" onSubmit={handleSaveHabit}>
              <input
                className="form-name"
                placeholder="习惯名称"
                value={habitForm.name}
                onChange={(event) =>
                  setHabitForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
              <select
                className="form-category"
                value={habitForm.category}
                onChange={(event) =>
                  setHabitForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                className="form-unit"
                value={habitForm.unit}
                onChange={(event) =>
                  setHabitForm((current) => ({
                    ...current,
                    unit: event.target.value as HabitUnit,
                  }))
                }
              >
                <option value="boolean">勾选</option>
                <option value="minutes">分钟</option>
                <option value="times">次数</option>
                <option value="time">时间</option>
              </select>
              <input
                className="form-target"
                type="text"
                inputMode="decimal"
                placeholder="目标：30 / 22:30"
                value={habitForm.target}
                onChange={(event) =>
                  setHabitForm((current) => ({
                    ...current,
                    target: event.target.value,
                  }))
                }
              />
              <input
                type="color"
                className="color-input form-color"
                value={habitForm.color}
                onChange={(event) =>
                  setHabitForm((current) => ({
                    ...current,
                    color: event.target.value,
                  }))
                }
              />
              <div className="habit-modal-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={closeHabitModal}
                >
                  取消
                </button>
                <button className="primary-button" type="submit">
                  {editingHabitId ? "确认保存" : "确认新增"}
                </button>
              </div>
            </form>
            <p className="hint" style={{ margin: "10px 0 0", fontSize: 12 }}>
              时间习惯填写目标时间，如 22:30；其他习惯填写数值目标，如 30。
            </p>
          </div>
        </div>
      )}
    </>
  );
}
