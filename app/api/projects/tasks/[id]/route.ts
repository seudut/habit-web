import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import {
  deleteProjectTask,
  getProjectTaskById,
  isValidColor,
  isValidProgress,
  isValidProjectDate,
  updateProjectTask,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const current = getProjectTaskById(id);
  if (!current) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  const body = (await request.json()) as {
    parentId?: string | null;
    name?: string;
    startDate?: string;
    endDate?: string;
    progress?: number;
    color?: string;
  };
  const startDate = body.startDate ?? current.startDate;
  const endDate = body.endDate ?? current.endDate;
  const progress = Number(body.progress ?? current.progress);
  if (
    (body.name !== undefined &&
      (typeof body.name !== "string" || !body.name.trim())) ||
    !isValidProjectDate(startDate) ||
    !isValidProjectDate(endDate) ||
    endDate < startDate ||
    (body.progress !== undefined && !isValidProgress(progress)) ||
    (body.color !== undefined && !isValidColor(body.color)) ||
    (body.parentId !== undefined &&
      body.parentId !== null &&
      typeof body.parentId !== "string")
  ) {
    return NextResponse.json(
      { error: "任务名称、日期范围、进度、颜色或父任务无效" },
      { status: 400 },
    );
  }

  const updated = updateProjectTask(id, {
    ...body,
    progress,
  });
  return updated
    ? NextResponse.json({ ok: true })
    : NextResponse.json(
        { error: "任务或父任务关系无效" },
        { status: 400 },
      );
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  return deleteProjectTask(id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "任务不存在" }, { status: 404 });
}
