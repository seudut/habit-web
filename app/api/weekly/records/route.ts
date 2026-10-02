import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { createWeeklyRecord, getWeeklyRecordById, getWeeklyTaskById, hasWeeklyRecordForWeek, hasWeeklyRecordOnDate, isDateWithinWeek, isValidDateString, isValidDuration, normalizeWeekStart } from "@/lib/weekly";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({
      error: "未登录"
    }, {
      status: 401
    });
  }
  const body = (await request.json()) as {
    scheduleTaskId?: string;
    weekStart?: string;
    date?: string;
    actualDuration?: number;
    completed?: boolean;
  };
  if (typeof body.scheduleTaskId !== "string" || !isValidDateString(body.weekStart) || !isValidDateString(body.date)) {
    return NextResponse.json({
      error: "scheduleTaskId、weekStart、date 不能为空"
    }, {
      status: 400
    });
  }
  const weekStart = normalizeWeekStart(body.weekStart);
  const task = getWeeklyTaskById(body.scheduleTaskId);
  if (!task || task.weekStart !== weekStart) {
    return NextResponse.json({
      error: "任务不存在或不属于当前周"
    }, {
      status: 400
    });
  }
  if (!isDateWithinWeek(body.date, weekStart)) {
    return NextResponse.json({
      error: "date 不在当前周内"
    }, {
      status: 400
    });
  }
  if (hasWeeklyRecordOnDate(body.scheduleTaskId, weekStart, body.date)) {
    return NextResponse.json({
      error: "该任务当天已有记录"
    }, {
      status: 409
    });
  }
  if (task.taskType !== "daily" && hasWeeklyRecordForWeek(body.scheduleTaskId, weekStart)) {
    return NextResponse.json({
      error: "单次任务本周只能安排一次"
    }, {
      status: 409
    });
  }
  const actualDuration = Number(body.actualDuration ?? 0);
  if (!isValidDuration(actualDuration)) {
    return NextResponse.json({
      error: "actualDuration 必须是非负数"
    }, {
      status: 400
    });
  }
  if (body.completed !== undefined && typeof body.completed !== "boolean") {
    return NextResponse.json({
      error: "完成状态无效"
    }, {
      status: 400
    });
  }
  const id = createWeeklyRecord({
    scheduleTaskId: body.scheduleTaskId,
    weekStart,
    date: body.date,
    actualDuration,
    completed: body.completed
  });
  return NextResponse.json({
    ok: true,
    id,
    record: getWeeklyRecordById(id)
  }, {
    status: 201
  });
}
