"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { HabitStat } from "@/lib/types";
import { EChart } from "./echart";

const MIN_DEVIATION = -1;
const MAX_DEVIATION = 3;

function clampDeviation(value: number) {
  return Math.max(MIN_DEVIATION, Math.min(MAX_DEVIATION, value));
}

function getTimeDeviationMinutes(
  name: string,
  target: number,
  value: number,
) {
  const isEarlyRise = name.includes("早起") || target < 12 * 60;

  if (isEarlyRise) {
    return value - target;
  }

  if (value < target && value <= 6 * 60) {
    return 24 * 60 - target + value;
  }

  return value - target;
}

function getTimeDeviationHours(
  name: string,
  target: number,
  value: number,
) {
  return clampDeviation(
    getTimeDeviationMinutes(name, target, value) / 60,
  );
}

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
        valueFormatter: (value) => {
          if (typeof value !== "number") return String(value);
          const sign = value > 0 ? "+" : "";
          return `${sign}${value.toFixed(1)}h`;
        },
      },
      legend: {
        type: "scroll",
        top: 0,
        data: ["Goal", ...stats.map((stat) => stat.name)],
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
        splitLine: { show: false },
        axisLabel: {
          interval: 0,
          margin: 6,
          fontSize: 10,
          color: "#4b5563",
          formatter: (value: string) => value.replace(/日$/, ""),
        },
      },
      yAxis: {
        type: "value",
        name: "偏离目标（小时）",
        nameTextStyle: { color: "#6b7280", fontSize: 11 },
        min: MIN_DEVIATION,
        max: MAX_DEVIATION,
        interval: 1,
        axisLabel: {
          color: "#4b5563",
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: "#f0f1f3" },
        },
      },
      series: [
        {
          name: "Goal",
          type: "line" as const,
          smooth: false,
          symbol: "none",
          connectNulls: true,
          silent: true,
          lineStyle: {
            type: "dashed",
            color: "#94a3b8",
            width: 1,
          },
          itemStyle: { color: "#94a3b8" },
          data: stats[0]?.values.map(() => 0) ?? [],
          z: 0,
        },
        ...stats.map((stat) => ({
          name: stat.name,
          type: "line" as const,
          smooth: false,
          symbol: "none",
          connectNulls: false,
          emphasis: { focus: "series" as const },
          lineStyle: { width: 2, color: stat.color },
          itemStyle: { color: stat.color },
          data: stat.values.map((value) => {
            if (value <= 0) return null;
            const deviation = getTimeDeviationHours(
              stat.name,
              stat.target,
              value,
            );
            return Math.round(deviation * 10) / 10;
          }),
        })),
      ],
    }),
    [stats],
  );

  return <EChart option={option} height={height} />;
}
