import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { isValidDateString, normalizeWeekStart, saveWeeklyPreferences } from "@/lib/weekly";
import type { WeeklyPreferences } from "@/lib/weekly-types";
export async function PATCH(request: Request) {
  if (!isApiRequestAuthenticated(request)) return NextResponse.json({
    error: "未登录"
  }, {
    status: 401
  });
  const body = (await request.json().catch(() => null)) as (Partial<WeeklyPreferences> & {
    weekStart?: string;
    onlyIfEmpty?: boolean;
  }) | null;
  if (!body || typeof body !== "object") return NextResponse.json({
    error: "请求数据无效"
  }, {
    status: 400
  });
  if (!isValidDateString(body.weekStart)) return NextResponse.json({
    error: "周日期无效"
  }, {
    status: 400
  });
  if (body.review !== undefined && (typeof body.review !== "string" || body.review.length > 50000)) {
    return NextResponse.json({
      error: "回顾内容无效或过长"
    }, {
      status: 400
    });
  }
  if (body.budgetMinutes !== undefined && (typeof body.budgetMinutes !== "number" || !Number.isFinite(body.budgetMinutes) || body.budgetMinutes < 0 || body.budgetMinutes > 10080)) {
    return NextResponse.json({
      error: "每周可用时间须在 0–168 小时之间"
    }, {
      status: 400
    });
  }
  if (body.habits !== undefined && (!Array.isArray(body.habits) || body.habits.length > 60 || body.habits.some(habit => !habit || typeof habit.id !== "string" || !habit.id || typeof habit.name !== "string" || !habit.name.trim() || habit.name.length > 100 || !Number.isInteger(habit.count) || habit.count < 1 || habit.count > 7 || typeof habit.minutes !== "number" || !Number.isFinite(habit.minutes) || habit.minutes < 0 || habit.minutes > 1440 || !Array.isArray(habit.checks) || habit.checks.length !== 7 || habit.checks.some(check => typeof check !== "boolean")) || new Set(body.habits.map(habit => habit.id)).size !== body.habits.length || new Set(body.habits.map(habit => habit.name.trim())).size !== body.habits.length)) {
    return NextResponse.json({
      error: "习惯名称、目标次数或打卡数据无效"
    }, {
      status: 400
    });
  }
  const patch: Partial<WeeklyPreferences> = {};
  if (body.review !== undefined) patch.review = body.review;
  if (body.budgetMinutes !== undefined) patch.budgetMinutes = body.budgetMinutes;
  if (body.habits !== undefined) patch.habits = body.habits.map(habit => ({
    ...habit,
    name: habit.name.trim()
  }));
  const preferences = saveWeeklyPreferences(normalizeWeekStart(body.weekStart), patch, body.onlyIfEmpty === true);
  return NextResponse.json({
    preferences
  });
}
