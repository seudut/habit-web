"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { formatMinutesAsTime } from "@/lib/scoring";
import type { HabitStat } from "@/lib/types";
import { EChart } from "./echart";

export function SleepTimeChart({
  stats,
  height = 280,
}: {
  stats: HabitStat[];
  height?: number;
}) {
  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) =>
          typeof value === "number" ? formatMinutesAsTime(value) : String(value),
      },
      legend: {
        type: "scroll",
        top: 0,
        data: stats.map((stat) => stat.name),
        textStyle: { fontSize: 11, color: "#4b5563" },
      },
      grid: { left: 58, right: 20, top: 42, bottom: 32 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: stats[0]?.values.map((_, index) => `${index + 1}日`) ?? [],
        axisLabel: { interval: 1 },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1440,
        interval: 360,
        axisLabel: {
          formatter: (value: number) => formatMinutesAsTime(value),
          color: "#4b5563",
        },
        splitLine: { lineStyle: { color: "#f0f1f3" } },
      },
      series: stats.map((stat, index) => ({
        name: stat.name,
        type: "line",
        smooth: true,
        symbol: "none",
        connectNulls: false,
        emphasis: { focus: "series" },
        lineStyle: { width: 2, color: stat.color },
        itemStyle: { color: stat.color },
        data: stat.values.map((value) => (value > 0 ? value : null)),
        markLine:
          index === 0
            ? {
                symbol: "none",
                silent: true,
                lineStyle: {
                  type: "dashed",
                  color: "#9ca3af",
                  width: 1,
                },
                label: {
                  show: true,
                  position: "insideEndTop",
                  fontSize: 10,
                  color: "#6b7280",
                  formatter: (params) =>
                    `目标 ${formatMinutesAsTime(Number(params.value))}`,
                },
                data: stats.map((goalStat) => ({
                  yAxis: goalStat.target,
                })),
              }
            : undefined,
      })),
    }),
    [stats],
  );

  return <EChart option={option} height={height} />;
}
