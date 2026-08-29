import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { deleteHabit, updateHabit } from "@/lib/db";
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
  const body = (await request.json()) as {
    name?: string;
    category?: string;
    target?: number;
    unit?: HabitUnit;
    color?: string;
  };

  const habit = updateHabit(id, {
    name: body.name,
    category: body.category,
    target: body.target,
    unit: body.unit,
    color: body.color,
  });

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
  deleteHabit(id);
  return NextResponse.json({ ok: true });
}
