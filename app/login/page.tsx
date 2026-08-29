import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isSessionValid, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  next?: string | string[];
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
  const cookieStore = await cookies();

  if (isSessionValid(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    redirect("/");
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <h1>习惯打卡</h1>
        <p>请先登录后查看和管理今天的数据</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
