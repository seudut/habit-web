import { NextResponse } from "next/server";
import { deleteRecordsForMonth, upsertRecord } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    habitId?: string;
    date?: string;
    value?: number;
    completed?: boolean;
    note?: string;
  };

  if (!body.habitId || !body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json(
      { error: "habitId 或 date 无效" },
      { status: 400 },
    );
  }

  const value = Math.max(0, Number(body.value ?? 0));
  upsertRecord(
    body.habitId,
    body.date,
    Number.isFinite(value) ? value : 0,
    Boolean(body.completed),
    body.note,
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month 参数无效" }, { status: 400 });
  }

  const deleted = deleteRecordsForMonth(month);
  return NextResponse.json({ ok: true, deleted });
}
