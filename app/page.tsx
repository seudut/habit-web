import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { isSessionValid, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getMonthData } from "@/lib/data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  year?: string | string[];
  month?: string | string[];
}>;

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const cookieStore = await cookies();
  if (!isSessionValid(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    redirect("/login");
  }

  const params = await searchParams;
  const now = new Date();
  const year = Number(
    Array.isArray(params.year) ? params.year[0] : params.year,
  );
  const month = Number(
    Array.isArray(params.month) ? params.month[0] : params.month,
  );
  const safeYear = Number.isInteger(year) && year > 1900 ? year : now.getFullYear();
  const safeMonth =
    Number.isInteger(month) && month >= 1 && month <= 12
      ? month
      : now.getMonth() + 1;
  const data = getMonthData(safeYear, safeMonth);

  return (
    <main className="page">
      <Dashboard initialData={data} />
    </main>
  );
}
