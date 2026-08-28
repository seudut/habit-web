import { NextResponse } from "next/server";
import { getMonthData } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "year 或 month 参数无效" },
      { status: 400 },
    );
  }

  return NextResponse.json(getMonthData(year, month));
}
