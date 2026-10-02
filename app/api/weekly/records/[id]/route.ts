import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { deleteWeeklyRecord, getWeeklyRecordById, hasWeeklyRecordOnDate, isDateWithinWeek, isValidDateString, isValidDuration, updateWeeklyRecord } from "@/lib/weekly";
export const dynamic = "force-dynamic";
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
    actualDuration?: number;
    completed?: boolean;
    date?: string;
  };
  if (body.actualDuration !== undefined && !isValidDuration(Number(body.actualDuration))) {
    return NextResponse.json({
      error: "actualDuration 必须是非负数"
    }, {
      status: 400
    });
  }
  if (body.completed !== undefined && typeof body.completed !== "boolean") {
    return NextResponse.json({
      error: "completed 必须是布尔值"
    }, {
      status: 400
    });
  }
  const current = getWeeklyRecordById(id);
  if (!current) return NextResponse.json({
    error: "记录不存在"
  }, {
    status: 404
  });
  if (body.date !== undefined) {
    if (!isValidDateString(body.date) || !isDateWithinWeek(body.date, current.weekStart)) {
      return NextResponse.json({
        error: "只能移动到本周的有效日期"
      }, {
        status: 400
      });
    }
    if (body.date !== current.date && hasWeeklyRecordOnDate(current.scheduleTaskId, current.weekStart, body.date)) {
      return NextResponse.json({
        error: "该任务在目标日期已有安排"
      }, {
        status: 409
      });
    }
  }
  if (body.actualDuration !== undefined) body.actualDuration = Number(body.actualDuration);
  const updated = updateWeeklyRecord(id, body);
  if (!updated) {
    return NextResponse.json({
      error: "记录不存在"
    }, {
      status: 404
    });
  }
  return NextResponse.json({
    ok: true,
    record: getWeeklyRecordById(id)
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
  const deleted = deleteWeeklyRecord(id);
  if (!deleted) {
    return NextResponse.json({
      error: "记录不存在"
    }, {
      status: 404
    });
  }
  return NextResponse.json({
    ok: true
  });
}
