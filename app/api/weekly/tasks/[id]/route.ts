import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { countWeeklyRecordsForTask, deleteWeeklyTask, getWeeklyTaskById, getWeeklyData, isValidDuration, updateWeeklyTask } from "@/lib/weekly";
import type { WeeklyCategory, WeeklyTaskType } from "@/lib/weekly-types";
export const dynamic = "force-dynamic";
const TASK_TYPES = new Set<WeeklyTaskType>(["once", "daily", "weekly"]);
const CATEGORIES = new Set<WeeklyCategory>(["recitation", "practice", "reading", "work", "leisure"]);
type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};
export async function PATCH(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({
      error: "未登录"
    }, {
      status: 401
    });
  }
  const {
    id
  } = await context.params;
  const body = (await request.json()) as {
    title?: string;
    estimatedDuration?: number;
    taskType?: WeeklyTaskType;
    category?: WeeklyCategory;
    targetCount?: number;
  };
  const current = getWeeklyTaskById(id);
  if (!current) {
    return NextResponse.json({
      error: "任务不存在"
    }, {
      status: 404
    });
  }
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
    return NextResponse.json({
      error: "title 不能为空"
    }, {
      status: 400
    });
  }
  if (body.estimatedDuration !== undefined && !isValidDuration(Number(body.estimatedDuration))) {
    return NextResponse.json({
      error: "estimatedDuration 必须是非负数"
    }, {
      status: 400
    });
  }
  if (body.taskType !== undefined && !TASK_TYPES.has(body.taskType)) {
    return NextResponse.json({
      error: "taskType 无效"
    }, {
      status: 400
    });
  }
  if (body.category !== undefined && !CATEGORIES.has(body.category)) {
    return NextResponse.json({
      error: "category 无效"
    }, {
      status: 400
    });
  }
  const nextTaskType = body.taskType ?? current.taskType;
  if (body.targetCount !== undefined && (!Number.isInteger(body.targetCount) || body.targetCount < 1 || body.targetCount > 7)) {
    return NextResponse.json({
      error: "每周目标次数须为 1–7 次"
    }, {
      status: 400
    });
  }
  if (nextTaskType !== "daily" && countWeeklyRecordsForTask(id) > 1) {
    return NextResponse.json({
      error: "该任务已安排多天，不能改为单次任务"
    }, {
      status: 409
    });
  }
  const updated = updateWeeklyTask(id, body);
  if (!updated) {
    return NextResponse.json({
      error: "任务不存在"
    }, {
      status: 404
    });
  }
  return NextResponse.json({
    ok: true,
    data: getWeeklyData(current.weekStart)
  });
}
export async function DELETE(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({
      error: "未登录"
    }, {
      status: 401
    });
  }
  const {
    id
  } = await context.params;
  const current = getWeeklyTaskById(id);
  const deleted = deleteWeeklyTask(id);
  if (!deleted) {
    return NextResponse.json({
      error: "任务不存在"
    }, {
      status: 404
    });
  }
  return NextResponse.json({
    ok: true,
    data: getWeeklyData(current!.weekStart)
  });
}
