import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { createWeeklyRecord } from "@/lib/weekly";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    scheduleTaskId?: string;
    weekStart?: string;
    date?: string;
    actualDuration?: number;
  };

  if (!body.scheduleTaskId || !body.weekStart || !body.date) {
    return NextResponse.json(
      { error: "scheduleTaskId、weekStart、date 不能为空" },
      { status: 400 },
    );
  }

  const id = createWeeklyRecord({
    scheduleTaskId: body.scheduleTaskId,
    weekStart: body.weekStart,
    date: body.date,
    actualDuration: Math.max(0, Number(body.actualDuration ?? 0)),
  });
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
