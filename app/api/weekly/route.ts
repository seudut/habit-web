import { NextResponse } from "next/server";
import { isApiRequestAuthenticated } from "@/lib/auth";
import { getWeeklyData, normalizeWeekStart } from "@/lib/weekly";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isApiRequestAuthenticated(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekStart = normalizeWeekStart(searchParams.get("weekStart") ?? undefined);
  return NextResponse.json(getWeeklyData(weekStart));
}
