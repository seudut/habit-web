import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { upsertMonthNote } from "@/lib/db";
import { getMonthKey } from "@/lib/month";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    year?: number;
    month?: number;
    content?: string;
  };
  const year = Number(body.year);
  const month = Number(body.month);

  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      { error: "year 或 month 参数无效" },
      { status: 400 },
    );
  }

  if (typeof body.content !== "string") {
    return NextResponse.json(
      { error: "content 必须是字符串" },
      { status: 400 },
    );
  }

  upsertMonthNote(getMonthKey(year, month), body.content);
  return NextResponse.json({ ok: true });
}
