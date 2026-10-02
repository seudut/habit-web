import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import {
  createProject,
  getProjectsData,
  isValidColor,
  isValidProjectDate,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json(getProjectsData());
}

export async function POST(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    startDate?: string;
    endDate?: string;
    color?: string;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const color = body.color ?? "#4f7cff";
  if (
    !name ||
    !isValidProjectDate(body.startDate) ||
    !isValidProjectDate(body.endDate) ||
    body.endDate < body.startDate ||
    !isValidColor(color)
  ) {
    return NextResponse.json(
      { error: "项目名称、开始/结束日期或颜色无效" },
      { status: 400 },
    );
  }

  const project = createProject({
    name,
    startDate: body.startDate,
    endDate: body.endDate,
    color,
  });
  if (!project) {
    return NextResponse.json(
      { error: "项目日期范围无效" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, project, data: getProjectsData() }, { status: 201 });
}
