import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { createWeeklyTask, getWeeklyData, isDateWithinWeek, isValidDateString, isValidDuration, normalizeWeekStart } from "@/lib/weekly";
import type { WeeklyCategory, WeeklyTaskType } from "@/lib/weekly-types";
export const dynamic = "force-dynamic";
const TASK_TYPES = new Set<WeeklyTaskType>(["once", "daily", "weekly"]);
const CATEGORIES = new Set<WeeklyCategory>(["recitation", "practice", "reading", "work", "leisure"]);
export async function POST(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({
      error: "未登录"
    }, {
      status: 401
    });
  }
  const body = (await request.json()) as {
    weekStart?: string;
    title?: string;
    estimatedDuration?: number;
    taskType?: WeeklyTaskType;
    category?: WeeklyCategory;
    targetCount?: number;
    dates?: string[];
  };
  const title = typeof body.title === "string" ? body.title : "";
  if (!isValidDateString(body.weekStart) || !title.trim()) {
    return NextResponse.json({
      error: "weekStart、title 不能为空"
    }, {
      status: 400
    });
  }
  const estimatedDuration = Number(body.estimatedDuration ?? 0);
  if (!isValidDuration(estimatedDuration)) {
    return NextResponse.json({
      error: "estimatedDuration 必须是非负数"
    }, {
      status: 400
    });
  }
  const taskType = body.taskType ?? "once";
  const category = body.category ?? "work";
  if (!TASK_TYPES.has(taskType) || !CATEGORIES.has(category)) {
    return NextResponse.json({
      error: "taskType 或 category 无效"
    }, {
      status: 400
    });
  }
  const weekStart = normalizeWeekStart(body.weekStart);
  const targetCount = taskType === "daily" ? body.targetCount ?? 7 : 1;
  const dates = body.dates ?? [];
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 7 || !Array.isArray(dates) || dates.length > (taskType === "daily" ? 7 : 1) || new Set(dates).size !== dates.length || dates.some(date => !isValidDateString(date) || !isDateWithinWeek(date, weekStart))) {
    return NextResponse.json({
      error: "目标次数或安排日期无效"
    }, {
      status: 400
    });
  }
  const id = createWeeklyTask({
    weekStart,
    title,
    estimatedDuration,
    taskType,
    category,
    targetCount,
    dates
  });
  return NextResponse.json({
    ok: true,
    id,
    data: getWeeklyData(weekStart)
  }, {
    status: 201
  });
}
