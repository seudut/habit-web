"use client";

import Link from "next/link";

export function AppTabs({ active }: { active: "month" | "weekly" }) {
  return (
    <nav className="app-tabs">
      <Link
        className={`app-tab ${active === "month" ? "active" : ""}`}
        href="/"
        aria-current={active === "month" ? "page" : undefined}
      >
        月度打卡
      </Link>
      <Link
        className={`app-tab ${active === "weekly" ? "active" : ""}`}
        href="/weekly"
        aria-current={active === "weekly" ? "page" : undefined}
      >
        周计划
      </Link>
    </nav>
  );
}
