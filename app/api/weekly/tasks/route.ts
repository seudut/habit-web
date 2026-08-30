import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { createWeeklyTask } from "@/lib/weekly";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    weekStart?: string;
    date?: string;
    title?: string;
  };

  if (
    !body.weekStart ||
    !body.date ||
    !body.title?.trim()
  ) {
    return NextResponse.json(
      { error: "weekStart、date、title 不能为空" },
      { status: 400 },
    );
  }

  const id = createWeeklyTask({
    weekStart: body.weekStart,
    date: body.date,
    title: body.title,
  });
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
