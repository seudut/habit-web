import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import {
  createProjectTask,
  isValidColor,
  isValidProgress,
  isValidProjectDate,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    projectId?: string;
    parentId?: string | null;
    name?: string;
    startDate?: string;
    endDate?: string;
    progress?: number;
    color?: string;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const progress = Number(body.progress ?? 0);
  const color = body.color ?? "#4f7cff";
  if (
    typeof body.projectId !== "string" ||
    !name ||
    !isValidProjectDate(body.startDate) ||
    !isValidProjectDate(body.endDate) ||
    body.endDate < body.startDate ||
    !isValidProgress(progress) ||
    !isValidColor(color) ||
    (body.parentId !== undefined &&
      body.parentId !== null &&
      typeof body.parentId !== "string")
  ) {
    return NextResponse.json(
      { error: "任务名称、项目、日期范围、进度或颜色无效" },
      { status: 400 },
    );
  }

  const task = createProjectTask({
    projectId: body.projectId,
    parentId: body.parentId ?? null,
    name,
    startDate: body.startDate,
    endDate: body.endDate,
    progress,
    color,
  });
  if (!task) {
    return NextResponse.json(
      { error: "项目或父任务无效" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, task }, { status: 201 });
}
