import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import {
  isDateWithinWeek,
  isValidDateString,
  normalizeWeekStart,
  upsertWeeklyDiary,
} from "@/lib/weekly";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    weekStart?: string;
    date?: string;
    content?: string;
  };

  if (
    !isValidDateString(body.weekStart) ||
    !isValidDateString(body.date)
  ) {
    return NextResponse.json(
      { error: "weekStart、date 不能为空" },
      { status: 400 },
    );
  }

  const weekStart = normalizeWeekStart(body.weekStart);
  if (!isDateWithinWeek(body.date, weekStart)) {
    return NextResponse.json(
      { error: "date 不在当前周内" },
      { status: 400 },
    );
  }
  if (
    body.content !== undefined &&
    typeof body.content !== "string"
  ) {
    return NextResponse.json(
      { error: "content 必须是字符串" },
      { status: 400 },
    );
  }

  upsertWeeklyDiary({
    weekStart,
    date: body.date,
    content: body.content ?? "",
  });
  return NextResponse.json({ ok: true });
}
