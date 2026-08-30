import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { upsertWeeklyDiary } from "@/lib/weekly";

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

  if (!body.weekStart || !body.date) {
    return NextResponse.json(
      { error: "weekStart、date 不能为空" },
      { status: 400 },
    );
  }

  upsertWeeklyDiary({
    weekStart: body.weekStart,
    date: body.date,
    content: body.content ?? "",
  });
  return NextResponse.json({ ok: true });
}
