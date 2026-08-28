"use client";

import { useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";

export function EChart({
  option,
  height,
}: {
  option: EChartsOption;
  height: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: { setOption: (option: EChartsOption) => void; resize: () => void; dispose: () => void } | null = null;
    let cancelled = false;

    const onResize = () => chart?.resize();

    import("echarts").then(({ init }) => {
      if (cancelled || !containerRef.current) return;
      chart = init(containerRef.current);
      chart.setOption(option);
      window.addEventListener("resize", onResize);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      chart?.dispose();
    };
  }, [option]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
