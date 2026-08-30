import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import {
  deleteWeeklyRecord,
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
  deleteWeeklyRecord(id);
  return NextResponse.json({ ok: true });
}
