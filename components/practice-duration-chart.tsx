"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { HabitStat } from "@/lib/types";
import { EChart } from "./echart";

export function PracticeDurationChart({
  stats,
  height = 280,
  max = 120,
}: {
  stats: HabitStat[];
  height?: number;
  max?: number;
}) {
  const dayCount = stats[0]?.values.length ?? 0;
  const interval = max <= 60 ? 10 : 15;
  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) =>
          typeof value === "number" ? `${value} 分钟` : String(value),
      },
      legend: {
        type: "scroll",
        top: 0,
        data: stats.map((stat) => stat.name),
        textStyle: { fontSize: 11, color: "#4b5563" },
      },
      grid: { left: 44, right: 20, top: 42, bottom: 32 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: stats[0]?.values.map((_, index) => `${index + 1}日`) ?? [],
        axisLine: {
          show: true,
          onZero: false,
          lineStyle: { color: "#9ca3af", width: 1 },
        },
        axisTick: {
          show: true,
          inside: false,
          length: 4,
          alignWithLabel: true,
          interval: 0,
          lineStyle: { color: "#9ca3af", width: 1 },
        },
        axisLabel: {
          interval: 0,
          margin: 6,
          fontSize: 10,
          color: "#4b5563",
          formatter: (value: string, index: number) => {
            const day = value.replace(/日$/, "");
            return index === dayCount - 1 ? `${day}日` : day;
          },
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "时长（分钟）",
        nameTextStyle: { color: "#6b7280", fontSize: 11 },
        min: 0,
        max,
        interval,
        axisLabel: {
          color: "#4b5563",
          fontSize: 10,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: "#f0f1f3" },
        },
      },
      series: stats.map((stat) => ({
        name: stat.name,
        type: "line" as const,
        smooth: false,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: true,
        connectNulls: false,
        emphasis: { focus: "series" as const },
        lineStyle: { width: 2, color: stat.color },
        itemStyle: {
          color: stat.color,
          borderColor: stat.color,
          borderWidth: 1,
        },
        data: stat.values.map((value) => (value > 0 ? value : null)),
      })),
    }),
    [stats, interval],
  );

  return <EChart option={option} height={height} />;
}
