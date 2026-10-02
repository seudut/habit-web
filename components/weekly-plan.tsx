"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode, RefObject } from "react";
import type { WeeklyData, WeeklyHabit, WeeklyPreferences, WeeklyRecord, WeeklyTask, WeeklyCategory } from "@/lib/weekly-types";
import { addWeekDays, formatWeeklyDuration as duration, TASK_CATEGORY_LABELS, taskTarget, WEEKDAYS, weeklyStats, weekNumber, weekStartOf } from "@/lib/weekly-utils";
import { SAVE_LABELS, useWeeklyAutosave } from "./weekly-autosave";
import type { SaveRegistry, SaveStatus } from "./weekly-autosave";
import styles from "./weekly-plan.module.css";
type TaskForm = {
  title: string;
  estimatedDuration: number;
  category: WeeklyCategory;
  dates: string[];
};
async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? {
      "Content-Type": "application/json"
    } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || (response.status === 401 ? "登录已过期，请重新登录" : "请求失败，请稍后重试"));
  return result as T;
}
function SaveIndicator({
  status,
  retry
}: {
  status: SaveStatus;
  retry: () => unknown;
}) {
  return <span className={`${styles.saveState} ${status === "error" ? styles.saveError : ""}`} aria-live="polite">
    {SAVE_LABELS[status]}{status === "error" && <button type="button" onClick={() => retry()}>重试</button>}
  </span>;
}
function Dialog({
  title,
  children,
  close
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input:not([type=checkbox]), textarea")?.focus();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={event => {
    event.preventDefault();
    close();
  }} onClick={event => {
    if (event.target === event.currentTarget) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }
  }}>
    <div className={styles.dialogHeader}><h2>{title}</h2><button className={styles.iconButton} type="button" aria-label="关闭对话框" onClick={close}>×</button></div>
    {children}
  </dialog>;
}
function Diary({
  date,
  week,
  content,
  registry
}: {
  date: string;
  week: string;
  content: string;
  registry: SaveRegistry;
}) {
  const note = useWeeklyAutosave(content, `weekly-diary-draft-${date}`, registry, async value => {
    await request("/api/weekly/diary", "PUT", {
      weekStart: week,
      date,
      content: value
    });
  }, (value): value is string => typeof value === "string");
  return <div className={styles.diary}>
    <textarea aria-label={`${date} 每日记录`} placeholder="今天的收获、感受或想法…" rows={10} value={note.value} onChange={event => note.change(event.target.value)} onBlur={() => {
      void note.flush();
    }} />
    <SaveIndicator status={note.status} retry={note.flush} />
  </div>;
}
function RecordCard({
  record,
  task,
  days,
  registry,
  busy,
  update,
  remove,
  edit
}: {
  record: WeeklyRecord;
  task: WeeklyTask;
  days: WeeklyData["days"];
  registry: SaveRegistry;
  busy: boolean;
  update: (record: WeeklyRecord, patch: {
    completed?: boolean;
    actualDuration?: number;
    date?: string;
  }) => Promise<boolean>;
  remove: (record: WeeklyRecord) => unknown;
  edit: () => void;
}) {
  const time = useWeeklyAutosave(record.actualDuration ? String(record.actualDuration) : "", `weekly-duration-draft-${record.id}`, registry, async value => {
    const numeric = value === "" ? 0 : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) throw new Error("时长无效");
    if (!(await update(record, {
      actualDuration: numeric
    }))) throw new Error("保存失败");
  }, (value): value is string => typeof value === "string" && (value === "" || Number.isFinite(Number(value)) && Number(value) >= 0));
  return <article className={`${styles.record} ${record.completed ? styles.recordDone : ""}`} draggable={!busy} onDragStart={event => {
    event.dataTransfer.setData("application/x-weekly-record", record.id);
    event.dataTransfer.effectAllowed = "move";
  }}>
    <div className={styles.recordTop}>
      <input type="checkbox" aria-label={`完成 ${task.title}`} checked={record.completed === 1} disabled={busy} onChange={event => {
        void update(record, {
          completed: event.target.checked
        });
      }} />
      <button className={styles.recordTitle} type="button" onClick={edit}>{task.title}</button>
      <details data-weekly-menu className={styles.recordMenu}>
        <summary aria-label={`${task.title} 更多操作`}>···</summary>
        <div className={styles.menuPanel}>
          <label>移动到<select aria-label={`移动 ${task.title} 到日期`} value={record.date} disabled={busy} onChange={event => {
              const date = event.target.value;
              const menu = event.target.closest("details");
              if (menu) menu.open = false;
              void time.flush().then(saved => {
                if (saved) void update(record, {
                  date
                });
              });
            }}>
            {days.map(day => <option value={day.date} key={day.date}>{day.label} {day.date.slice(5).replace("-", "/")}</option>)}
          </select></label>
          <button type="button" onClick={edit}>编辑任务</button>
          <button className={styles.dangerText} type="button" disabled={busy} onClick={() => remove(record)}>移除此日安排</button>
        </div>
      </details>
    </div>
    <div className={styles.recordBottom}><span className={styles.category} data-category={task.category}>{TASK_CATEGORY_LABELS[task.category]}</span>
      <label className={styles.timeInput}><input type="number" min="0" step="1" aria-label={`${task.title} 实际时长（分钟）`} placeholder="时长" value={time.value} onChange={event => time.change(event.target.value)} onBlur={() => {
          void time.flush();
        }} /><span>分</span></label>
    </div>
    {time.status !== "saved" && <SaveIndicator status={time.status} retry={time.flush} />}
  </article>;
}
function Calendar({
  week,
  today,
  selected,
  choose
}: {
  week: string;
  today: string;
  selected: string;
  choose: (date: string) => unknown;
}) {
  const [month, setMonth] = useState(selected.slice(0, 7));
  const first = `${month}-01`;
  const grid = Array.from({
    length: 42
  }, (_, index) => addWeekDays(weekStartOf(first), index));
  function shift(delta: number) {
    const next = new Date(`${first}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setMonth(next.toISOString().slice(0, 7));
  }
  return <section className={styles.panel} aria-label="选择周和日期">
    <div className={styles.calendarTitle}><button className={styles.iconButton} aria-label="上个月" onClick={() => shift(-1)}>‹</button><strong>{month.replace("-", " 年 ")} 月</strong><button className={styles.iconButton} aria-label="下个月" onClick={() => shift(1)}>›</button></div>
    <div className={styles.calendarWeekdays}><span />{WEEKDAYS.map(day => <span key={day}>{day.slice(1)}</span>)}</div>
    {Array.from({
      length: 6
    }, (_, row) => <div key={row} className={`${styles.calendarRow} ${weekStartOf(grid[row * 7]) === week ? styles.calendarCurrent : ""}`}>
      <button className={styles.weekNumber} aria-label={`查看第 ${weekNumber(grid[row * 7])} 周`} onClick={() => choose(grid[row * 7])}>W{weekNumber(grid[row * 7])}</button>
      {grid.slice(row * 7, row * 7 + 7).map(date => <button key={date} className={`${styles.calendarDay} ${date.slice(0, 7) !== month ? styles.outsideMonth : ""} ${date === today ? styles.calendarToday : ""} ${date === selected ? styles.calendarSelected : ""}`} aria-label={date} aria-current={date === today ? "date" : undefined} aria-pressed={date === selected} onClick={() => choose(date)}>{Number(date.slice(8))}</button>)}
    </div>)}
  </section>;
}
function TaskDialog({
  task,
  date,
  data,
  saving,
  save,
  close
}: {
  task?: WeeklyTask;
  date?: string;
  data: WeeklyData;
  saving: boolean;
  save: (form: TaskForm) => Promise<void>;
  close: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [minutes, setMinutes] = useState(String(task?.estimatedDuration || ""));
  const [category, setCategory] = useState<WeeklyCategory>(task?.category ?? "work");
  const [dates, setDates] = useState<string[]>(date ? [date] : []);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await save({
        title: title.trim(),
        estimatedDuration: Number(minutes || 0),
        category,
        dates: task ? [] : dates
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败");
    }
  }
  return <Dialog title={task ? "编辑任务" : "新建任务"} close={() => {
    if (!saving) close();
  }}><form className={styles.form} onSubmit={submit}>
    <label>任务名称<input autoFocus required maxLength={300} value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：阅读 30 分钟" /></label>
    <div className={styles.formRow}>
      <label>分类<select value={category} onChange={event => setCategory(event.target.value as WeeklyCategory)}>{Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>预计时长（分钟）<input type="number" min="0" step="1" value={minutes} onChange={event => setMinutes(event.target.value)} placeholder="可稍后填写" /></label>
    </div>
    {!task && <fieldset className={styles.dateField}><legend>安排日期 <span>不选日期则稍后安排</span></legend><div className={styles.dateChoices}>{data.days.map(day => <button type="button" aria-pressed={dates.includes(day.date)} className={dates.includes(day.date) ? styles.chosenDate : ""} key={day.date} onClick={() => setDates(current => {
            return current.includes(day.date) ? [] : [day.date];
          })}>{day.label}<small>{day.date.slice(5).replace("-", "/")}</small></button>)}</div></fieldset>}
    {error && <p className={styles.formError} role="alert">{error}</p>}
    <div className={styles.dialogActions}><button className={styles.secondaryButton} type="button" disabled={saving} onClick={close}>取消</button><button className={styles.primaryButton} disabled={saving || !title.trim()}>{saving ? "保存中…" : task ? "保存修改" : dates.length ? "创建并安排" : "创建任务"}</button></div>
  </form></Dialog>;
}
function HabitDialog({
  habit,
  habits,
  save,
  remove,
  close
}: {
  habit?: WeeklyHabit;
  habits: WeeklyHabit[];
  save: (habit: WeeklyHabit) => void;
  remove: () => void;
  close: () => void;
}) {
  const [name, setName] = useState(habit?.name ?? "");
  const [count, setCount] = useState(habit?.count ?? 7);
  const [minutes, setMinutes] = useState(habit?.minutes ?? 20);
  const duplicate = habits.some(item => item.id !== habit?.id && item.name === name.trim());
  return <Dialog title={habit ? "习惯设置" : "添加习惯"} close={close}><form className={styles.form} onSubmit={event => {
      event.preventDefault();
      if (duplicate || !name.trim()) return;
      save({
        id: habit?.id ?? crypto.randomUUID(),
        name: name.trim(),
        count,
        minutes,
        checks: habit?.checks ?? Array<boolean>(7).fill(false)
      });
      close();
    }}>
    <label>习惯名称<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="例如：散步、阅读、冥想" /></label>
    <div className={styles.formRow}><label>每周目标次数<input type="number" required min="1" max="7" step="1" value={count} onChange={event => setCount(Number(event.target.value))} /></label><label>每次预计时长（分钟）<input type="number" required min="0" max="1440" step="1" value={minutes} onChange={event => setMinutes(Number(event.target.value))} /></label></div>
    <p className={styles.hint}>每一天可打卡一次，完成 {count} 次即达成周目标。打卡时长按每次预计时长估算。</p>
    {duplicate && <p className={styles.formError}>这个习惯名称已经存在</p>}
    <div className={styles.dialogActions}>{habit && <button className={styles.dangerButton} type="button" onClick={remove}>删除习惯</button>}<button className={styles.secondaryButton} type="button" onClick={close}>取消</button><button className={styles.primaryButton} disabled={duplicate || !name.trim()}>保存习惯</button></div>
  </form></Dialog>;
}
function validPreferences(value: unknown): value is WeeklyPreferences {
  if (!value || typeof value !== "object") return false;
  const preference = value as WeeklyPreferences;
  return typeof preference.review === "string" && Number.isFinite(preference.budgetMinutes) && preference.budgetMinutes >= 0 && preference.budgetMinutes <= 10080 && Array.isArray(preference.habits) && preference.habits.every(habit => habit && typeof habit.id === "string" && typeof habit.name === "string" && Number.isInteger(habit.count) && habit.count >= 1 && habit.count <= 7 && Number.isFinite(habit.minutes) && habit.minutes >= 0 && habit.minutes <= 1440 && Array.isArray(habit.checks) && habit.checks.length === 7 && habit.checks.every(check => typeof check === "boolean"));
}
export function WeeklyPlan({
  initialData
}: {
  initialData: WeeklyData;
}) {
  const [data, setData] = useState(initialData);
  const [selected, setSelected] = useState(initialData.days.find(day => day.isToday)?.date ?? initialData.weekStart);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const leave = useRef<() => Promise<boolean>>(async () => true);
  const navigating = useRef(false);
  async function navigate(week: string, date?: string) {
    if (navigating.current) return;
    navigating.current = true;
    setLoading(true);
    setError("");
    try {
      if (!(await leave.current())) throw new Error("有内容保存失败，请重试保存后再切换周。");
      const next = await request<WeeklyData>(`/api/weekly?weekStart=${week}`);
      setSelected(date ?? next.days.find(day => day.isToday)?.date ?? next.weekStart);
      setData(next);
      const url = new URL(window.location.href);
      url.searchParams.set("weekStart", next.weekStart);
      window.history.replaceState(null, "", url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "加载失败，请重试");
    } finally {
      navigating.current = false;
      setLoading(false);
    }
  }
  return <>{error && <div className={styles.notice} role="alert">{error}<button className={styles.iconButton} aria-label="关闭提示" onClick={() => setError("")}>×</button></div>}
    <WeeklyWorkspace key={data.weekStart} initialData={data} initialSelected={selected} navigate={navigate} loading={loading} beforeLeave={leave} />
  </>;
}
function WeeklyWorkspace({
  initialData,
  initialSelected,
  navigate,
  loading,
  beforeLeave
}: {
  initialData: WeeklyData;
  initialSelected: string;
  navigate: (week: string, date?: string) => Promise<void>;
  loading: boolean;
  beforeLeave: RefObject<() => Promise<boolean>>;
}) {
  const [data, setData] = useState(initialData);
  const dataRef = useRef(data);
  dataRef.current = data;
  function changeData(update: (current: WeeklyData) => WeeklyData) {
    const next = update(dataRef.current);
    dataRef.current = next;
    setData(next);
  }
  const week = data.weekStart;
  const registry = useMemo<SaveRegistry>(() => new Map(), []);
  const locks = useRef(new Set<string>());
  const pending = useRef(new Set<Promise<unknown>>());
  const [busy, setBusy] = useState<string[]>([]);
  const [importing, setImporting] = useState(!initialData.preferences.initialized);
  const [importError, setImportError] = useState("");
  const importRequest = useRef<Promise<{
    preferences: WeeklyPreferences;
  }> | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
    action?: {
      label: string;
      run: () => unknown;
    };
  } | null>(null);
  const [selected, setSelected] = useState(initialSelected);
  const [picker, setPicker] = useState<string | null>(null);
  const [taskDialog, setTaskDialog] = useState<{
    task?: WeeklyTask;
    date?: string;
  } | null>(null);
  const [habitDialog, setHabitDialog] = useState<{
    habit?: WeeklyHabit;
  } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    text: string;
    run: () => Promise<void>;
  } | null>(null);
  const [transfer, setTransfer] = useState<{
    source: WeeklyData;
    target: string;
    mode: "all" | "unfinished";
  } | null>(null);
  const [copyHabits, setCopyHabits] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "scheduled" | "done">("all");
  const [dragDate, setDragDate] = useState<string | null>(null);
  const preferences = useWeeklyAutosave(initialData.preferences, `weekly-preferences-draft-${week}`, registry, async value => {
    if (!initialData.preferences.initialized) {
      if (!importRequest.current) throw new Error("请先完成本周数据初始化");
      await importRequest.current;
    }
    await request("/api/weekly/preferences", "PATCH", {
      weekStart: week,
      review: value.review,
      budgetMinutes: value.budgetMinutes,
      habits: value.habits
    });
  }, validPreferences, initialData.preferences.initialized);
  const prefs = preferences.value;
  const stats = weeklyStats(data);
  const totalEstimated = data.tasks.reduce((sum, task) => sum + task.estimatedDuration * Math.max(taskTarget(task), data.records.filter(record => record.scheduleTaskId === task.id).length), 0);
  const habitPlanned = prefs.habits.reduce((sum, habit) => sum + habit.count * habit.minutes, 0);
  const habitEstimated = prefs.habits.reduce((sum, habit) => sum + habit.checks.filter(Boolean).length * habit.minutes, 0);
  const actual = data.records.reduce((sum, record) => sum + record.actualDuration, 0);
  const planned = totalEstimated + habitPlanned;
  const taskProgress = data.tasks.map(task => {
    const records = data.records.filter(record => record.scheduleTaskId === task.id);
    const target = taskTarget(task);
    const done = records.filter(record => record.completed).length;
    const status = done >= target ? "done" : records.length >= target ? "scheduled" : "pending";
    return { task, status };
  });
  const statusCounts = {
    pending: taskProgress.filter(item => item.status === "pending").length,
    scheduled: taskProgress.filter(item => item.status === "scheduled").length,
    done: taskProgress.filter(item => item.status === "done").length
  };
  const filteredTasks = taskProgress.filter(item => filter === "all" || item.status === filter);
  const unavailable = loading || importing;
  async function initializePreferences() {
    setImporting(true);
    setImportError("");
    try {
      importRequest.current ??= request("/api/weekly/preferences", "PATCH", {
        weekStart: week,
        onlyIfEmpty: true
      });
      const result = await importRequest.current;
      preferences.reset(result.preferences);
    } catch (error) {
      importRequest.current = null;
      setImportError(error instanceof Error ? error.message : "初始化失败");
    } finally {
      setImporting(false);
    }
  }
  useEffect(() => {
    if (!initialData.preferences.initialized) void initializePreferences();
    // Initialization imports browser data only when this week's server data is empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    beforeLeave.current = async () => {
      if (importRequest.current) {
        try {
          await importRequest.current;
        } catch {
          return false;
        }
      }
      const saved = await Promise.all([...registry.values()].map(flush => flush()));
      await Promise.allSettled([...pending.current]);
      return saved.every(Boolean);
    };
  }, [beforeLeave, registry]);
  useEffect(() => {
    const dismissMenus = (event: PointerEvent) => {
      document.querySelectorAll<HTMLDetailsElement>("details[data-weekly-menu][open]").forEach(menu => {
        if (!menu.contains(event.target as Node)) menu.open = false;
      });
    };
    const escapeMenus = (event: KeyboardEvent) => {
      if (event.key === "Escape") document.querySelectorAll<HTMLDetailsElement>("details[data-weekly-menu][open]").forEach(menu => {
        menu.open = false;
      });
    };
    document.addEventListener("pointerdown", dismissMenus);
    document.addEventListener("keydown", escapeMenus);
    return () => {
      document.removeEventListener("pointerdown", dismissMenus);
      document.removeEventListener("keydown", escapeMenus);
    };
  }, []);
  useEffect(() => {
    if (!picker) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-task-picker]")) setPicker(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPicker(null);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [picker]);
  async function run<T>(key: string, work: () => Promise<T>): Promise<T | undefined> {
    if (locks.current.has(key)) return undefined;
    locks.current.add(key);
    setBusy([...locks.current]);
    const job = work();
    pending.current.add(job);
    try {
      return await job;
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "操作失败，请重试",
        error: true
      });
      return undefined;
    } finally {
      pending.current.delete(job);
      locks.current.delete(key);
      setBusy([...locks.current]);
    }
  }
  function mergeTasks(next: WeeklyData) {
    changeData(current => {
      const existing = new Set(current.tasks.map(task => task.id));
      const nextIds = new Set(next.tasks.map(task => task.id));
      return {
        ...current,
        tasks: next.tasks,
        records: [...current.records.filter(record => nextIds.has(record.scheduleTaskId)), ...next.records.filter(record => !existing.has(record.scheduleTaskId))]
      };
    });
  }
  async function updateRecord(record: WeeklyRecord, patch: {
    completed?: boolean;
    actualDuration?: number;
    date?: string;
  }) {
    if (locks.current.has(record.id)) {
      await Promise.allSettled([...pending.current]);
    }
    const snapshot = dataRef.current.records.find(item => item.id === record.id);
    if (!snapshot) return false;
    const {
      completed,
      ...fields
    } = patch;
    const normalized: Partial<WeeklyRecord> = {
      ...fields,
      ...(completed !== undefined ? {
        completed: completed ? 1 : 0
      } : {})
    };
    const result = await run(record.id, async () => {
      changeData(current => ({
        ...current,
        records: current.records.map(item => item.id === record.id ? {
          ...item,
          ...normalized
        } : item)
      }));
      try {
        const result = await request<{
          record: WeeklyRecord;
        }>(`/api/weekly/records/${record.id}`, "PATCH", patch);
        changeData(current => ({
          ...current,
          records: current.records.map(item => item.id === record.id ? result.record : item)
        }));
        return true;
      } catch (error) {
        changeData(current => ({
          ...current,
          records: current.records.map(item => item.id === record.id ? snapshot : item)
        }));
        throw error;
      }
    });
    return result === true;
  }
  async function addRecord(date: string, taskId: string) {
    await run(`add-${taskId}-${date}`, async () => {
      const result = await request<{
        record: WeeklyRecord;
      }>("/api/weekly/records", "POST", {
        weekStart: week,
        date,
        scheduleTaskId: taskId
      });
      changeData(current => ({
        ...current,
        records: [...current.records, result.record]
      }));
      setPicker(null);
    });
  }
  async function removeRecord(record: WeeklyRecord) {
    const flush = registry.get(`weekly-duration-draft-${record.id}`);
    if (flush && !(await flush())) return;
    const snapshot = dataRef.current.records.find(item => item.id === record.id) ?? record;
    await run(`delete-${record.id}`, async () => {
      await request(`/api/weekly/records/${record.id}`, "DELETE");
      changeData(current => ({
        ...current,
        records: current.records.filter(item => item.id !== record.id)
      }));
      setNotice({
        text: "已移除此日安排",
        action: {
          label: "撤销",
          run: () => run(`restore-${record.id}`, async () => {
            const result = await request<{
              record: WeeklyRecord;
            }>("/api/weekly/records", "POST", {
              ...snapshot,
              completed: snapshot.completed === 1
            });
            changeData(current => ({
              ...current,
              records: [...current.records, result.record]
            }));
            setNotice({
              text: "已恢复安排"
            });
          })
        }
      });
    });
  }
  async function saveTask(form: TaskForm) {
    if (locks.current.has("task-save")) return;
    locks.current.add("task-save");
    setBusy([...locks.current]);
    const id = taskDialog?.task?.id;
    const job = request<{
      data: WeeklyData;
    }>(id ? `/api/weekly/tasks/${id}` : "/api/weekly/tasks", id ? "PATCH" : "POST", {
      ...form,
      ...(!id ? { taskType: "once", targetCount: 1 } : {}),
      weekStart: week
    });
    pending.current.add(job);
    try {
      const result = await job;
      mergeTasks(result.data);
      setTaskDialog(null);
      setNotice({
        text: id ? "任务已更新" : form.dates.length ? "任务已创建并安排" : "任务已创建，可从每日卡片中安排"
      });
    } finally {
      pending.current.delete(job);
      locks.current.delete("task-save");
      setBusy([...locks.current]);
    }
  }
  function deleteTask(task: WeeklyTask) {
    setConfirm({
      title: "删除任务",
      text: `删除“${task.title}”及它的全部每日安排和时长记录？`,
      run: async () => {
        const result = await run("confirm", async () => request<{
          data: WeeklyData;
        }>(`/api/weekly/tasks/${task.id}`, "DELETE"));
        if (result) {
          mergeTasks(result.data);
          setConfirm(null);
          setNotice({
            text: "任务已删除"
          });
        }
      }
    });
  }
  function changeHabit(habit: WeeklyHabit) {
    const current = preferences.current.current;
    preferences.change({
      ...current,
      habits: current.habits.some(item => item.id === habit.id) ? current.habits.map(item => item.id === habit.id ? habit : item) : [...current.habits, habit]
    });
  }
  function removeHabit(habit: WeeklyHabit) {
    setHabitDialog(null);
    setConfirm({
      title: "删除习惯",
      text: `删除本周的“${habit.name}”及打卡记录？`,
      run: async () => {
        const previous = preferences.current.current.habits;
        preferences.change({
          ...preferences.current.current,
          habits: previous.filter(item => item.id !== habit.id)
        });
        setConfirm(null);
        setNotice({
          text: "习惯已删除",
          action: {
            label: "撤销",
            run: () => {
              const current = preferences.current.current;
              if (!current.habits.some(item => item.name === habit.name)) preferences.change({
                ...current,
                habits: [...current.habits, habit]
              });
              setNotice(null);
            }
          }
        });
      }
    });
  }
  async function chooseDate(date: string) {
    if (weekStartOf(date) !== week) await navigate(weekStartOf(date), date);else {
      setSelected(date);
      document.getElementById(`weekly-day-${date}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest"
      });
    }
  }
  async function previewTransfer(mode: "all" | "unfinished") {
    if (!(await beforeLeave.current())) {
      setNotice({ text: "有内容保存失败，请先重试保存", error: true });
      return;
    }
    await run("transfer-preview", async () => {
      const source = mode === "all" ? await request<WeeklyData>(`/api/weekly?weekStart=${addWeekDays(week, -7)}`) : dataRef.current;
      const candidates = source.tasks.filter(task => mode === "all" || source.records.filter(record => record.scheduleTaskId === task.id && record.completed).length < taskTarget(task));
      if (!candidates.length && (mode === "unfinished" || !source.preferences.initialized || !source.preferences.habits.length)) {
        setNotice({
          text: mode === "all" ? "上周还没有可复制的计划" : "本周任务已全部完成"
        });
        return;
      }
      setCopyHabits(mode === "all");
      setTransfer({
        source,
        target: mode === "all" ? week : addWeekDays(week, 7),
        mode
      });
    });
  }
  async function confirmTransfer() {
    if (!transfer) return;
    await run("transfer-save", async () => {
      const result = await request<{
        copied: number;
        data: WeeklyData;
      }>("/api/weekly/copy", "POST", {
        sourceWeek: transfer.source.weekStart,
        targetWeek: transfer.target,
        mode: transfer.mode,
        copyHabits
      });
      if (transfer.target === week) {
        mergeTasks(result.data);
        preferences.reset(result.data.preferences);
      }
      setTransfer(null);
      setNotice({
        text: result.copied ? `已${transfer.mode === "all" ? "复制" : "延续"} ${result.copied} 项任务${copyHabits ? "，习惯设置已同步" : ""}` : "已同步计划，已复制的任务不会重复添加",
        action: transfer.target !== week ? {
          label: "查看下周",
          run: () => navigate(transfer.target)
        } : undefined
      });
    });
  }
  const candidates = transfer?.source.tasks.filter(task => transfer.mode === "all" || transfer.source.records.filter(record => record.scheduleTaskId === task.id && record.completed).length < taskTarget(task)) ?? [];
  const remainingBudget = prefs.budgetMinutes - planned;
  return <div className={styles.workspace}>
    <header className={styles.header}>
      <div><div className={styles.heading}><h1>周计划</h1><span className={styles.weekBadge}>第 {weekNumber(week)} 周</span></div><p>{week.replaceAll("-", "/")} — {addWeekDays(week, 6).slice(5).replace("-", "/")}</p></div>
      <nav className={styles.weekNav} aria-label="切换周"><button aria-label="上一周" disabled={unavailable} onClick={() => navigate(addWeekDays(week, -7))}>‹</button><button disabled={unavailable} onClick={() => navigate(weekStartOf(data.today))}>本周</button><button aria-label="下一周" disabled={unavailable} onClick={() => navigate(addWeekDays(week, 7))}>›</button></nav>
    </header>
    {notice && <div className={`${styles.notice} ${notice.error ? styles.noticeError : ""}`} role={notice.error ? "alert" : "status"}><span>{notice.text}</span>{notice.action && <button className={styles.textButton} onClick={notice.action.run}>{notice.action.label}</button>}<button className={styles.iconButton} aria-label="关闭提示" onClick={() => setNotice(null)}>×</button></div>}
    {importError && <div className={`${styles.notice} ${styles.noticeError}`} role="alert">习惯和回顾初始化失败：{importError}<button className={styles.textButton} onClick={() => void initializePreferences()}>重试</button></div>}
    {(loading || importing) && <div className={styles.loading} role="status">{loading ? "正在保存并切换周…" : "正在同步本周习惯和回顾…"}</div>}
    <fieldset className={styles.workspaceBody} disabled={unavailable || !!importError}>
      <legend className={styles.srOnly}>周计划内容</legend>
      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <div className={styles.summaryStrip} aria-label="本周统计">
            <div><span>本周任务</span><strong>{data.tasks.length}<small> 项</small></strong></div>
            <div className={styles.summaryCompletion} title="按任务执行次数统计完成进度">
              <svg className={styles.completionRing} viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="none" stroke="#edf0f4" strokeWidth="5" />{stats.totalTasks > 0 && <circle cx="24" cy="24" r="20" fill="none" stroke="#22a06b" strokeWidth="5" strokeLinecap={stats.completedTasks ? "round" : "butt"} pathLength="100" strokeDasharray={`${stats.completionRate} 100`} transform="rotate(-90 24 24)" />}</svg>
              <div className={styles.summaryCompletionText}><span>完成进度</span><strong>{stats.totalTasks ? `${stats.completionRate}%` : "—"}</strong><small>{stats.totalTasks ? `${stats.completedTasks} / ${stats.totalTasks} 次完成` : "尚未安排任务"}</small></div>
            </div>
            <div><span>计划投入</span><strong>{duration(planned)}</strong></div>
            <div><span>实际记录</span><strong>{duration(actual)}</strong></div>
          </div>
          <section className={styles.panel}>
            <div className={`${styles.sectionHeader} ${styles.libraryHeader}`} data-collapsed={!libraryOpen}>
              <button className={styles.sectionToggle} aria-expanded={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}><h2>本周任务</h2><span className={styles.countBadge}>{data.tasks.length}</span><span className={styles.caret}>{libraryOpen ? "⌃" : "⌄"}</span></button>
              <div className={styles.filters} role="group" aria-label="筛选本周任务">{(["all", "pending", "scheduled", "done"] as const).map(value => <button key={value} data-status={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? `全部 ${data.tasks.length}` : `${{pending: "待安排", scheduled: "已安排", done: "已完成"}[value]} ${statusCounts[value]}`}</button>)}</div>
              <div className={styles.inlineActions}><button className={styles.primaryButton} disabled={unavailable || !!importError} onClick={() => setTaskDialog({})}>＋ 新建任务</button><button className={styles.textButton} disabled={busy.includes("transfer-preview")} onClick={() => void previewTransfer("all")}>复制上周</button><button className={styles.textButton} disabled={!data.tasks.length || busy.includes("transfer-preview")} onClick={() => void previewTransfer("unfinished")}>延续到下周</button></div>
            </div>
            {libraryOpen && <>
              {!data.tasks.length ? <div className={styles.emptyPlan}><span className={styles.emptyIcon}>＋</span><div><strong>从一件重要的事开始</strong><p>新建任务并选择日期，或复制上周的计划。</p></div><button className={styles.secondaryButton} onClick={() => setTaskDialog({})}>创建第一个任务</button></div> : <div className={styles.taskLibrary}>
                {filteredTasks.map(({task, status}) => {
                  return <article className={styles.libraryTask} data-status={status} key={task.id}>
                    <div className={styles.libraryTaskTop}><strong>{task.title}</strong><details data-weekly-menu className={styles.recordMenu}><summary aria-label={`${task.title} 更多操作`}>···</summary><div className={styles.menuPanel}><button onClick={() => setTaskDialog({
                            task
                          })}>编辑任务</button><button className={styles.dangerText} onClick={() => deleteTask(task)}>删除任务及记录</button></div></details></div>
                    <div className={styles.libraryMeta}><span className={styles.category} data-category={task.category}>{TASK_CATEGORY_LABELS[task.category]}</span><span title="预计时长">{task.estimatedDuration ? `${task.estimatedDuration} 分钟` : "未估时"}</span><span className={styles.statusBadge} data-status={status}>{status === "done" ? "已完成" : status === "scheduled" ? "已安排" : "待安排"}</span></div>
                  </article>;
                })}
                {filter !== "all" && !filteredTasks.length && <p className={styles.hint}>这个分组还没有任务。</p>}
              </div>}
            </>}
          </section>

          <section className={styles.boardSection} aria-label="七日任务看板">
            <div className={styles.sectionHeader}><h2>一周安排</h2><span className={styles.boardHint}>拖动任务可改期，也可从 ··· 菜单移动</span></div>
            <div className={styles.dayTabs} role="group" aria-label="选择查看日期">{data.days.map(day => <button key={day.date} aria-pressed={selected === day.date} aria-current={day.date === data.today ? "date" : undefined} onClick={() => setSelected(day.date)}>{day.label}<span>{day.date.slice(8)}{day.date === data.today && <i />}</span></button>)}</div>
            <div className={styles.board}>
              {data.days.map((day, dayIndex) => {
                const records = data.records.filter(record => record.date === day.date);
                const estimated = records.reduce((sum, record) => sum + (data.tasks.find(task => task.id === record.scheduleTaskId)?.estimatedDuration ?? 0), 0);
                const dayActual = records.reduce((sum, record) => sum + record.actualDuration, 0);
                const available = data.tasks.filter(task => !data.records.some(record => record.scheduleTaskId === task.id && record.date === day.date) && (task.taskType === "daily" || !data.records.some(record => record.scheduleTaskId === task.id)));
                return <section id={`weekly-day-${day.date}`} key={day.date} className={`${styles.day} ${day.date === data.today ? styles.today : ""} ${dayIndex > 4 ? styles.weekend : ""} ${selected === day.date ? styles.selectedDay : ""} ${dragDate === day.date ? styles.dropTarget : ""}`} aria-label={`${day.label} ${day.date}`} onDragOver={event => {
                  if (event.dataTransfer.types.includes("application/x-weekly-record")) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragDate(day.date);
                  }
                }} onDragLeave={event => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragDate(null);
                }} onDrop={event => {
                  event.preventDefault();
                  setDragDate(null);
                  const record = data.records.find(item => item.id === event.dataTransfer.getData("application/x-weekly-record"));
                  if (record && record.date !== day.date) {
                    const flush = registry.get(`weekly-duration-draft-${record.id}`);
                    void (flush ? flush() : Promise.resolve(true)).then(saved => {
                      if (saved) void updateRecord(record, {
                        date: day.date
                      });
                    });
                  }
                }}>
                  <div className={styles.dayHeader}><div><strong>{day.label}</strong><span>{day.date.slice(5).replace("-", "/")}</span></div>{day.date === data.today && <span className={styles.todayBadge}>今天</span>}</div>
                  <div className={styles.dayStats}><span>{records.filter(record => record.completed).length} / {records.length} 次</span><span title={`预计 ${duration(estimated)}，实际 ${duration(dayActual)}`}>{estimated ? `预计 ${duration(estimated)}` : "待安排"}</span></div>
                  <div className={styles.dayTasks}>
                    {records.map(record => {
                      const task = data.tasks.find(item => item.id === record.scheduleTaskId);
                      return task ? <RecordCard key={record.id} record={record} task={task} days={data.days} registry={registry} busy={busy.includes(record.id)} update={updateRecord} remove={removeRecord} edit={() => setTaskDialog({
                        task
                      })} /> : null;
                    })}
                  </div>
                  <div className={styles.dayAdd} data-task-picker>
                    <button className={styles.addDayButton} aria-expanded={picker === day.date} onClick={() => setPicker(picker === day.date ? null : day.date)}>＋ 添加任务</button>
                    {picker === day.date && <div className={styles.picker}><button className={styles.pickerNew} onClick={() => {
                        setTaskDialog({
                          date: day.date
                        });
                        setPicker(null);
                      }}>＋ 新建并安排到{day.label}</button>{available.length > 0 ? <><p>选择本周已有任务</p>{available.map(task => <button key={task.id} disabled={busy.includes(`add-${task.id}-${day.date}`)} onClick={() => void addRecord(day.date, task.id)}>{task.title}<small>{task.estimatedDuration ? `${task.estimatedDuration} 分` : "未估时"}</small></button>)}</> : <p>没有可选任务，可以直接新建。</p>}</div>}
                  </div>
                  <Diary date={day.date} week={week} content={data.diaries.find(diary => diary.date === day.date)?.content ?? ""} registry={registry} />
                </section>;
              })}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}><div><h2>本周回顾</h2><p className={styles.sectionDescription}>留下收获，也为下一周做一点调整</p></div><SaveIndicator status={preferences.status} retry={preferences.flush} /></div>
            <div className={styles.reviewPrompts}>{["本周完成了什么", "遇到什么阻碍", "下周调整什么"].map(prompt => <button key={prompt} onClick={() => preferences.change({
                ...preferences.current.current,
                review: `${preferences.current.current.review}${preferences.current.current.review ? "\n\n" : ""}${prompt}：\n`
              })}>＋ {prompt}</button>)}</div>
            <textarea className={styles.review} aria-label="本周回顾" placeholder="记录一件值得记住的事，或者下周想做出的改变…" value={prefs.review} onChange={event => preferences.change({
              ...preferences.current.current,
              review: event.target.value
            })} onBlur={() => {
              void preferences.flush();
            }} rows={10} maxLength={50000} />
          </section>
        </div>

        <aside className={styles.sidebar}>
          <Calendar week={week} today={data.today} selected={selected} choose={chooseDate} />
          <section className={styles.panel} aria-label="习惯打卡">
            <div className={styles.sectionHeader}><div><h2>习惯打卡</h2><p className={styles.sectionDescription}>每天一点，慢慢积累</p></div><button className={styles.habitAdd} aria-label="添加习惯" disabled={prefs.habits.length >= 60} title={prefs.habits.length >= 60 ? "每周最多 60 项习惯" : "添加习惯"} onClick={() => setHabitDialog({})}>＋</button></div>
            <div className={styles.habitList}>
              {prefs.habits.map(habit => {
                const done = habit.checks.filter(Boolean).length;
                const progress = Math.min(100, Math.round(done / habit.count * 100));
                return <div className={styles.habitRow} key={habit.id}>
                  <div className={styles.habitHeading}><button className={styles.habitName} aria-label={`设置习惯 ${habit.name}`} onClick={() => setHabitDialog({habit})}>{habit.name}<span aria-hidden="true">⚙</span></button><span className={`${styles.habitProgress} ${done >= habit.count ? styles.doneText : ""}`}>{done} / {habit.count} 次{done >= habit.count ? " ✓" : ""}</span></div>
                  <p className={styles.habitTarget}>目标 {habit.count} 次 / 周 · {habit.minutes} 分 / 次</p>
                  <div className={styles.habitDays}>
                    {data.days.map((day, index) => <label key={day.date} className={`${styles.habitDay} ${day.date === data.today ? styles.habitToday : ""}`} title={`${day.label} ${day.date}`}><span className={styles.habitDayLabel}>{day.label.replace("周", "")}</span><span className={styles.habitCheck}><input type="checkbox" aria-label={`${habit.name} ${day.label} ${day.date} 打卡`} checked={habit.checks[index]} onChange={event => {
                      const current = preferences.current.current.habits.find(item => item.id === habit.id);
                      if (current) changeHabit({
                        ...current,
                        checks: current.checks.map((checked, dayIndex) => dayIndex === index ? event.target.checked : checked)
                      });
                    }} /><span aria-hidden="true">{habit.checks[index] ? "✓" : ""}</span></span></label>)}
                  </div>
                  <div className={styles.miniTrack}><i style={{width: `${progress}%`}} /></div>
                </div>;
              })}
            </div>
            {!prefs.habits.length && <div className={styles.emptyHabits}>添加一个习惯，开始记录每一天。</div>}
            <div className={styles.sectionFooter}><span>计划 {duration(habitPlanned)}<br />已打卡估算 {duration(habitEstimated)}</span><SaveIndicator status={preferences.status} retry={preferences.flush} /></div>
          </section>
          <section className={styles.panel}><div className={styles.sectionHeader}><h2>时间安排</h2></div>
            <BudgetInput value={prefs.budgetMinutes} change={value => preferences.change({
              ...preferences.current.current,
              budgetMinutes: value
            })} registry={registry} week={week} />
            <div className={styles.durationList}>{[{
                label: "计划投入",
                value: planned,
                color: "#4f7cff"
              }, {
                label: "实际记录",
                value: actual,
                color: "#22a06b"
              }, {
                label: "习惯打卡估算",
                value: habitEstimated,
                color: "#8b7dc2"
              }].map(stat => <div key={stat.label}><div className={styles.durationLabel}><span>{stat.label}</span><strong>{duration(stat.value)}</strong></div><div className={styles.durationTrack}><i style={{
                    width: `${prefs.budgetMinutes ? Math.min(100, stat.value / prefs.budgetMinutes * 100) : 0}%`,
                    background: stat.color
                  }} /></div></div>)}</div>
            <div className={`${styles.capacity} ${remainingBudget < 0 ? styles.overCapacity : ""}`}>{remainingBudget < 0 ? `超出可用时间 ${duration(-remainingBudget)}，可以减少安排。` : `还可安排 ${duration(remainingBudget)}`}</div>
            <p className={styles.hint}>计划包含任务与习惯目标；实际记录包含已填写时长的任务，习惯打卡时长单独估算。</p><SaveIndicator status={preferences.status} retry={preferences.flush} />
          </section>
        </aside>
      </div>
    </fieldset>
    {taskDialog && <TaskDialog task={taskDialog.task} date={taskDialog.date} data={data} saving={busy.includes("task-save")} save={saveTask} close={() => setTaskDialog(null)} />}
    {habitDialog && <HabitDialog habit={habitDialog.habit} habits={prefs.habits} save={changeHabit} remove={() => {
      if (habitDialog.habit) removeHabit(habitDialog.habit);
    }} close={() => setHabitDialog(null)} />}
    {confirm && <Dialog title={confirm.title} close={() => {
      if (!busy.includes("confirm")) setConfirm(null);
    }}><p className={styles.confirmText}>{confirm.text}</p><div className={styles.dialogActions}><button className={styles.secondaryButton} disabled={busy.includes("confirm")} onClick={() => setConfirm(null)}>取消</button><button className={styles.dangerButton} disabled={busy.includes("confirm")} onClick={() => void confirm.run()}>{busy.includes("confirm") ? "处理中…" : "确认删除"}</button></div></Dialog>}
    {transfer && <Dialog title={transfer.mode === "all" ? "复制上周计划" : "延续未完成任务"} close={() => {
      if (!busy.includes("transfer-save")) setTransfer(null);
    }}><p className={styles.confirmText}>将 {candidates.length} 项任务{transfer.mode === "all" ? "复制到本周" : `延续到 ${transfer.target.slice(5).replace("-", "/")} 开始的下一周`}，完成状态和实际时长重新开始。原周记录保留。</p><ul className={styles.transferList}>{candidates.map(task => <li key={task.id}>{task.title}<span>{TASK_CATEGORY_LABELS[task.category]}</span></li>)}</ul>{transfer.mode === "all" && <label className={styles.copyHabits}><input type="checkbox" checked={copyHabits} onChange={event => setCopyHabits(event.target.checked)} />同时复制习惯设置，已有同名习惯保留</label>}<p className={styles.hint}>保留对应的星期安排，同一来源的任务不会重复添加。</p><div className={styles.dialogActions}><button className={styles.secondaryButton} disabled={busy.includes("transfer-save")} onClick={() => setTransfer(null)}>取消</button><button className={styles.primaryButton} disabled={busy.includes("transfer-save")} onClick={() => void confirmTransfer()}>{busy.includes("transfer-save") ? "处理中…" : "确认复制"}</button></div></Dialog>}
  </div>;
}
function BudgetInput({
  value,
  change,
  registry,
  week
}: {
  value: number;
  change: (value: number) => void;
  registry: SaveRegistry;
  week: string;
}) {
  const [draft, setDraft] = useState(String(Math.round(value / 60 * 100) / 100));
  const [error, setError] = useState(false);
  const current = useRef(draft);
  const changeRef = useRef(change);
  changeRef.current = change;
  function commit() {
    const hours = Number(current.current);
    if (current.current.trim() === "" || !Number.isFinite(hours) || hours < 0 || hours > 168) {
      setError(true);
      return false;
    }
    setError(false);
    changeRef.current(Math.round(hours * 60));
    return true;
  }
  useEffect(() => {
    const next = String(Math.round(value / 60 * 100) / 100);
    setDraft(next);
    current.current = next;
  }, [value]);
  useEffect(() => {
    const key = `weekly-budget-${week}`;
    registry.set(key, async () => commit());
    return () => {
      registry.delete(key);
    };
  }, [registry, week]);
  return <><label className={styles.budget}>每周可用时间<span><input aria-label="每周可用时间（小时）" aria-invalid={error} type="number" min="0" max="168" step="any" value={draft} onChange={event => {
          current.current = event.target.value;
          setDraft(event.target.value);
        }} onBlur={commit} />小时</span></label>{error && <p className={styles.formError}>请输入 0–168 小时</p>}</>;
}
