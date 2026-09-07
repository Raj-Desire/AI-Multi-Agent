import React, { useState, useMemo } from "react";
import { LeadTrendsResponse, LeadTrendPoint } from "../../types";
import { TrendingUp, Calendar, Sparkles, PhoneForwarded, HelpCircle, PhoneOff } from "lucide-react";

interface LeadTrendsChartProps {
  trends: LeadTrendsResponse | null;
  isLoading: boolean;
  activeMetric: string;
  onMetricChange: (metric: string) => void;
}

export function LeadTrendsChart({
  trends,
  isLoading,
  activeMetric,
  onMetricChange,
}: LeadTrendsChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const points: LeadTrendPoint[] = trends?.points || [];

  const metricTabs = [
    { id: "all", label: "All Leads", icon: Sparkles, color: "#6366F1" },
    { id: "interested", label: "Interested", icon: Sparkles, color: "#10B981" },
    { id: "callback", label: "Callbacks", icon: PhoneForwarded, color: "#8B5CF6" },
    { id: "follow_up", label: "Follow-up", icon: HelpCircle, color: "#3B82F6" },
    { id: "no_answer", label: "No Answer", icon: PhoneOff, color: "#64748B" },
  ];

  const currentTab = metricTabs.find((t) => t.id === activeMetric) || metricTabs[0];

  const getValue = (pt: LeadTrendPoint): number => {
    switch (activeMetric) {
      case "interested":
        return pt.interested;
      case "callback":
        return pt.callback_requested;
      case "follow_up":
        return pt.needs_follow_up;
      case "no_answer":
        return pt.no_answer;
      default:
        return pt.total_leads;
    }
  };

  const values = useMemo(() => points.map((p) => getValue(p)), [points, activeMetric]);
  const maxValue = useMemo(() => Math.max(...values, 5), [values]);
  const totalInSeries = useMemo(() => values.reduce((a, b) => a + b, 0), [values]);

  // SVG dimensions
  const width = 800;
  const height = 220;
  const paddingX = 40;
  const paddingY = 30;

  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  // Calculate coordinates
  const coords = useMemo(() => {
    if (points.length === 0) return [];
    const stepX = points.length > 1 ? chartWidth / (points.length - 1) : chartWidth / 2;

    return points.map((pt, idx) => {
      const val = getValue(pt);
      const x = paddingX + (points.length === 1 ? chartWidth / 2 : idx * stepX);
      const y = paddingY + chartHeight - (val / maxValue) * chartHeight;
      return { x, y, val, label: pt.display_label, date: pt.date, point: pt };
    });
  }, [points, maxValue, chartWidth, chartHeight, paddingX, paddingY, activeMetric]);

  // Generate SVG Path for line and area fill
  const linePath = useMemo(() => {
    if (coords.length === 0) return "";
    return coords.reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
    }, "");
  }, [coords]);

  const areaPath = useMemo(() => {
    if (coords.length === 0) return "";
    const first = coords[0];
    const last = coords[coords.length - 1];
    const baselineY = paddingY + chartHeight;
    return `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
  }, [coords, linePath, paddingY, chartHeight]);

  return (
    <div className="p-4 sm:p-5 rounded-[var(--radius-main,0.5rem)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs space-y-4">
      {/* Header with Title & Metric Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--color-primary)]" />
            <h3 className="text-sm font-bold text-[var(--color-heading)]">
              Lead Interest Over Time
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              {totalInSeries} Leads
            </span>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Progression of prospective campaign lead interest over time
          </p>
        </div>

        {/* Metric Selector Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
          {metricTabs.map((tab) => {
            const isSelected = activeMetric === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onMetricChange(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors shrink-0 cursor-pointer ${
                  isSelected
                    ? "bg-[var(--color-heading)] text-[var(--color-background)] font-semibold shadow-xs"
                    : "bg-[var(--color-background)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]/40"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Visual SVG Chart Area */}
      {isLoading ? (
        <div className="h-52 flex items-center justify-center animate-pulse">
          <div className="h-32 w-full bg-[var(--color-border)]/30 rounded" />
        </div>
      ) : points.length === 0 ? (
        <div className="h-52 flex flex-col items-center justify-center text-xs text-[var(--color-muted)] space-y-1">
          <Calendar className="w-8 h-8 opacity-40 mb-1" />
          <p className="font-medium">No lead activity recorded for this date range.</p>
          <p className="text-[11px] opacity-75">Try selecting a broader date range or removing filters.</p>
        </div>
      ) : (
        <div className="relative w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-48 sm:h-56 overflow-visible select-none"
          >
            <defs>
              <linearGradient id="leadAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={currentTab.color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={currentTab.color} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const y = paddingY + chartHeight * (1 - ratio);
              const val = Math.round(maxValue * ratio);
              return (
                <g key={i}>
                  <line
                    x1={paddingX}
                    y1={y}
                    x2={width - paddingX}
                    y2={y}
                    stroke="var(--color-border)"
                    strokeDasharray="3 3"
                    strokeOpacity="0.5"
                  />
                  <text
                    x={paddingX - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="text-[10px] fill-[var(--color-muted)] font-mono"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Area Fill Under Line */}
            {areaPath && <path d={areaPath} fill="url(#leadAreaGradient)" />}

            {/* Main Trend Line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={currentTab.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data Points and Interaction Circles */}
            {coords.map((c, idx) => {
              const isHovered = hoveredIndex === idx;
              return (
                <g
                  key={idx}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Outer transparent hit target */}
                  <circle cx={c.x} cy={c.y} r="14" fill="transparent" />

                  {/* Visible Point Marker */}
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={isHovered ? "5" : "3.5"}
                    fill="var(--color-surface)"
                    stroke={currentTab.color}
                    strokeWidth={isHovered ? "3" : "2"}
                    className="transition-all duration-150"
                  />

                  {/* X Axis Date Label */}
                  {(coords.length <= 12 || idx % Math.ceil(coords.length / 8) === 0 || idx === coords.length - 1) && (
                    <text
                      x={c.x}
                      y={height - 8}
                      textAnchor="middle"
                      className="text-[10px] fill-[var(--color-muted)] font-sans"
                    >
                      {c.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Floating Hover Tooltip */}
          {hoveredIndex !== null && coords[hoveredIndex] && (
            <div
              className="absolute z-20 pointer-events-none p-2 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-heading)] text-[var(--color-background)] shadow-xl text-xs space-y-1 transform -translate-x-1/2 -translate-y-full transition-all"
              style={{
                left: `${(coords[hoveredIndex].x / width) * 100}%`,
                top: `${(coords[hoveredIndex].y / height) * 100 - 4}%`,
              }}
            >
              <div className="font-bold text-[11px] border-b border-[var(--color-background)]/20 pb-0.5">
                {coords[hoveredIndex].label}
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="opacity-90">{currentTab.label}:</span>
                <span className="font-bold">{coords[hoveredIndex].val}</span>
              </div>
              {activeMetric === "all" && (
                <div className="text-[10px] opacity-75 pt-0.5 space-y-0.5 border-t border-[var(--color-background)]/10">
                  <div>Interested: {coords[hoveredIndex].point.interested}</div>
                  <div>Callbacks: {coords[hoveredIndex].point.callback_requested}</div>
                  <div>Information: {coords[hoveredIndex].point.needs_follow_up}</div>
                  <div>No Answer: {coords[hoveredIndex].point.no_answer}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
