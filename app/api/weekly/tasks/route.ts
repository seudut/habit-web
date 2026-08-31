import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import {
  createWeeklyTask,
  isValidDateString,
  isValidDuration,
  normalizeWeekStart,
} from "@/lib/weekly";
import type {
  WeeklyCategory,
  WeeklyTaskType,
} from "@/lib/weekly-types";

export const dynamic = "force-dynamic";

const TASK_TYPES = new Set<WeeklyTaskType>(["once", "daily", "weekly"]);
const CATEGORIES = new Set<WeeklyCategory>([
  "recitation",
  "practice",
  "reading",
  "work",
  "leisure",
]);

export async function POST(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    weekStart?: string;
    title?: string;
    estimatedDuration?: number;
    taskType?: WeeklyTaskType;
    category?: WeeklyCategory;
  };

  const title = typeof body.title === "string" ? body.title : "";
  if (!isValidDateString(body.weekStart) || !title.trim()) {
    return NextResponse.json(
      { error: "weekStart、title 不能为空" },
      { status: 400 },
    );
  }

  const estimatedDuration = Number(body.estimatedDuration ?? 0);
  if (!isValidDuration(estimatedDuration)) {
    return NextResponse.json(
      { error: "estimatedDuration 必须是非负数" },
      { status: 400 },
    );
  }

  const taskType = body.taskType ?? "once";
  const category = body.category ?? "work";
  if (!TASK_TYPES.has(taskType) || !CATEGORIES.has(category)) {
    return NextResponse.json(
      { error: "taskType 或 category 无效" },
      { status: 400 },
    );
  }

  const id = createWeeklyTask({
    weekStart: normalizeWeekStart(body.weekStart),
    title,
    estimatedDuration,
    taskType,
    category,
  });
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
