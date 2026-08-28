import { NextResponse } from "next/server";
import { createHabit } from "@/lib/db";
import type { HabitUnit } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    category?: string;
    target?: number;
    unit?: HabitUnit;
    color?: string;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "习惯名称不能为空" }, { status: 400 });
  }

  const habit = createHabit({
    name,
    category: body.category || "other",
    target:
      body.unit === "boolean"
        ? 1
        : Math.max(0, Number(body.target ?? 0)),
    unit: body.unit || "boolean",
    color: body.color || "#3b82f6",
  });

  return NextResponse.json(habit, { status: 201 });
}
