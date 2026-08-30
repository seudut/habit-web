import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { deleteWeeklyTask, updateWeeklyTask } from "@/lib/weekly";

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
    title?: string;
    actualTime?: string;
    completed?: boolean;
  };

  const updated = updateWeeklyTask(id, body);
  if (!updated) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  deleteWeeklyTask(id);
  return NextResponse.json({ ok: true });
}
