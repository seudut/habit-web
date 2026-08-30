import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppTabs } from "@/components/app-tabs";
import { WeeklyPlan } from "@/components/weekly-plan";
import { isSessionValid, SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  getWeeklyData,
  normalizeWeekStart,
} from "@/lib/weekly";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  weekStart?: string | string[];
}>;

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const cookieStore = await cookies();
  if (!isSessionValid(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    redirect("/login?next=/weekly");
  }

  const params = await searchParams;
  const weekStart = normalizeWeekStart(
    Array.isArray(params.weekStart)
      ? params.weekStart[0]
      : params.weekStart,
  );
  const data = getWeeklyData(weekStart);

  return (
    <main className="page">
      <AppTabs active="weekly" />
      <WeeklyPlan initialData={data} />
    </main>
  );
}
