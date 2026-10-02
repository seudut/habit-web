import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { copyWeeklyPlan, getWeeklyData, isValidDateString, normalizeWeekStart } from "@/lib/weekly";
export async function POST(request: Request) {
  if (!isApiRequestAuthenticated(request)) return NextResponse.json({
    error: "未登录"
  }, {
    status: 401
  });
  const body = (await request.json().catch(() => null)) as {
    sourceWeek?: string;
    targetWeek?: string;
    mode?: "all" | "unfinished";
    copyHabits?: boolean;
  } | null;
  if (!body || typeof body !== "object") return NextResponse.json({
    error: "请求数据无效"
  }, {
    status: 400
  });
  if (!isValidDateString(body.sourceWeek) || !isValidDateString(body.targetWeek) || !["all", "unfinished"].includes(body.mode ?? "")) {
    return NextResponse.json({
      error: "复制参数无效"
    }, {
      status: 400
    });
  }
  const source = normalizeWeekStart(body.sourceWeek);
  const target = normalizeWeekStart(body.targetWeek);
  if (source === target) return NextResponse.json({
    error: "请选择不同的周"
  }, {
    status: 400
  });
  try {
    const copied = copyWeeklyPlan(source, target, body.mode!, body.copyHabits === true);
    return NextResponse.json({
      copied,
      data: getWeeklyData(target)
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "复制失败，请重试"
    }, {
      status: 409
    });
  }
}
