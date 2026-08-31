import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import {
  countWeeklyRecordsForTask,
  deleteWeeklyTask,
  getWeeklyTaskById,
  isValidDuration,
  updateWeeklyTask,
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

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    title?: string;
    estimatedDuration?: number;
    taskType?: WeeklyTaskType;
    category?: WeeklyCategory;
  };

  const current = getWeeklyTaskById(id);
  if (!current) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  if (
    body.title !== undefined &&
    (typeof body.title !== "string" || !body.title.trim())
  ) {
    return NextResponse.json(
      { error: "title 不能为空" },
      { status: 400 },
    );
  }
  if (
    body.estimatedDuration !== undefined &&
    !isValidDuration(Number(body.estimatedDuration))
  ) {
    return NextResponse.json(
      { error: "estimatedDuration 必须是非负数" },
      { status: 400 },
    );
  }
  if (
    body.taskType !== undefined &&
    !TASK_TYPES.has(body.taskType)
  ) {
    return NextResponse.json(
      { error: "taskType 无效" },
      { status: 400 },
    );
  }
  if (body.category !== undefined && !CATEGORIES.has(body.category)) {
    return NextResponse.json(
      { error: "category 无效" },
      { status: 400 },
    );
  }

  const nextTaskType = body.taskType ?? current.taskType;
  if (
    nextTaskType !== "daily" &&
    countWeeklyRecordsForTask(id) > 1
  ) {
    return NextResponse.json(
      { error: "该任务已有多条每日记录，不能改为 Once/Weekly" },
      { status: 409 },
    );
  }

  const updated = updateWeeklyTask(id, body);
  if (!updated) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = deleteWeeklyTask(id);
  if (!deleted) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
