"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { HabitStat } from "@/lib/types";
import { EChart } from "./echart";

export function HabitChart({
  stats,
  height = 320,
}: {
  stats: HabitStat[];
  height?: number;
}) {
  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) => `${value} 分`,
      },
      legend: {
        type: "scroll",
        top: 0,
        data: stats.map((stat) => stat.name),
        textStyle: { fontSize: 11, color: "#4b5563" },
      },
      grid: { left: 44, right: 18, top: 42, bottom: 32 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: stats[0]?.scores.map((_, index) => `${index + 1}日`) ?? [],
        axisLabel: { interval: 1 },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { formatter: "{value}" },
        splitLine: { lineStyle: { color: "#f0f1f3" } },
      },
      series: stats.map((stat) => ({
        name: stat.name,
        type: "line",
        smooth: true,
        symbol: "none",
        emphasis: { focus: "series" },
        lineStyle: { width: 2, color: stat.color },
        itemStyle: { color: stat.color },
        data: stat.scores,
      })),
    }),
    [stats],
  );

  return <EChart option={option} height={height} />;
}
