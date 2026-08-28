"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { HabitStat } from "@/lib/types";
import { EChart } from "./echart";

export function HabitChart({ stats }: { stats: HabitStat[] }) {
  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const list = Array.isArray(params) ? params : [params];
          const first = list[0];
          const stat = stats[first.dataIndex];
          if (!stat) return "";
          return `${stat.name}<br/>完成 ${stat.count}/${stat.planned} 天<br/>完成率 ${stat.rate}%`;
        },
      },
      grid: { left: 112, right: 32, top: 18, bottom: 30 },
      xAxis: {
        type: "value",
        max: Math.max(...stats.map((stat) => stat.planned), 1),
        axisLabel: { formatter: "{value}天" },
        splitLine: { lineStyle: { color: "#f0f1f3" } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: stats.map((stat) => stat.name),
        axisLabel: {
          color: "#374151",
          fontSize: 12,
          width: 100,
          overflow: "truncate",
        },
      },
      series: [
        {
          type: "bar",
          data: stats.map((stat) => ({
            value: stat.count,
            itemStyle: { color: stat.color, borderRadius: [0, 6, 6, 0] },
          })),
          barMaxWidth: 18,
          label: {
            show: true,
            position: "right",
            formatter: (params) => {
              const stat = stats[params.dataIndex];
              return stat ? `${stat.rate}%` : "";
            },
            color: "#6b7280",
            fontSize: 11,
          },
        },
      ],
    }),
    [stats],
  );

  return <EChart option={option} height={Math.max(230, stats.length * 42)} />;
}
