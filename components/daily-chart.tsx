"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { DailyStat } from "@/lib/types";
import { EChart } from "./echart";

export function DailyChart({ stats }: { stats: DailyStat[] }) {
  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) => `${value}%`,
      },
      grid: { left: 44, right: 16, top: 26, bottom: 34 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: stats.map((stat) => `${stat.day}日`),
        axisLabel: { interval: 1 },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { formatter: "{value}%" },
        splitLine: { lineStyle: { color: "#f0f1f3" } },
      },
      series: [
        {
          name: "完成率",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          data: stats.map((stat) => stat.rate),
          lineStyle: { width: 3, color: "#4f7cff" },
          itemStyle: { color: "#4f7cff" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(79,124,255,0.28)" },
                { offset: 1, color: "rgba(79,124,255,0.02)" },
              ],
            },
          },
          markLine: {
            symbol: "none",
            lineStyle: { type: "dashed", color: "#22a06b" },
            label: { formatter: "目标 80%", color: "#22a06b" },
            data: [{ yAxis: 80 }],
          },
        },
      ],
    }),
    [stats],
  );

  return <EChart option={option} height={260} />;
}
