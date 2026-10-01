import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppTabs } from "@/components/app-tabs";
import { ProjectGantt } from "@/components/project-gantt";
import { isSessionValid, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getProjectsData } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const cookieStore = await cookies();
  if (!isSessionValid(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    redirect("/login?next=/projects");
  }

  const data = getProjectsData();

  return (
    <main className="page">
      <AppTabs active="projects" />
      <ProjectGantt initialData={data} />
    </main>
  );
}
