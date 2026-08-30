import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { deleteHabitForMonth, updateHabitForMonth } from "@/lib/db";
import { isValidMonthKey } from "@/lib/month";
import type { HabitUnit } from "@/lib/types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const month = new URL(request.url).searchParams.get("month");
  if (!isValidMonthKey(month)) {
    return NextResponse.json({ error: "month 参数无效" }, { status: 400 });
  }
  const body = (await request.json()) as {
    name?: string;
    category?: string;
    target?: number;
    unit?: HabitUnit;
    color?: string;
  };

  const habit = updateHabitForMonth(
    month,
    id,
    {
      name: body.name,
      category: body.category,
      target: body.target,
      unit: body.unit,
      color: body.color,
    },
  );

  if (!habit) {
    return NextResponse.json({ error: "习惯不存在" }, { status: 404 });
  }
  return NextResponse.json(habit);
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const month = new URL(request.url).searchParams.get("month");
  if (!isValidMonthKey(month)) {
    return NextResponse.json({ error: "month 参数无效" }, { status: 400 });
  }
  const deleted = deleteHabitForMonth(month, id);
  if (!deleted) {
    return NextResponse.json({ error: "习惯不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
