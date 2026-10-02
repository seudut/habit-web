import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import {
  getProjectsData,
  deleteProject,
  getProjectById,
  isValidColor,
  isValidProjectDate,
  updateProject,
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
  const current = getProjectById(id);
  if (!current) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  const body = (await request.json()) as {
    name?: string;
    startDate?: string;
    endDate?: string;
    color?: string;
  };
  const startDate = body.startDate ?? current.startDate;
  const endDate = body.endDate ?? current.endDate;
  if (
    (body.name !== undefined &&
      (typeof body.name !== "string" || !body.name.trim())) ||
    !isValidProjectDate(startDate) ||
    !isValidProjectDate(endDate) ||
    endDate < startDate ||
    (body.color !== undefined && !isValidColor(body.color))
  ) {
    return NextResponse.json(
      { error: "项目名称、日期范围或颜色无效" },
      { status: 400 },
    );
  }

  const updated = updateProject(id, body);
  return updated
    ? NextResponse.json({ ok: true, data: getProjectsData() })
    : NextResponse.json({ error: "项目不存在" }, { status: 404 });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  return deleteProject(id)
    ? NextResponse.json({ ok: true, data: getProjectsData() })
    : NextResponse.json({ error: "项目不存在" }, { status: 404 });
}
