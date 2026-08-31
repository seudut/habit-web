import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import {
  deleteWeeklyRecord,
  isValidDuration,
  updateWeeklyRecord,
} from "@/lib/weekly";

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
    actualDuration?: number;
    completed?: boolean;
  };

  if (
    body.actualDuration !== undefined &&
    !isValidDuration(Number(body.actualDuration))
  ) {
    return NextResponse.json(
      { error: "actualDuration 必须是非负数" },
      { status: 400 },
    );
  }
  if (body.completed !== undefined && typeof body.completed !== "boolean") {
    return NextResponse.json(
      { error: "completed 必须是布尔值" },
      { status: 400 },
    );
  }

  const updated = updateWeeklyRecord(id, body);
  if (!updated) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = deleteWeeklyRecord(id);
  if (!deleted) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
