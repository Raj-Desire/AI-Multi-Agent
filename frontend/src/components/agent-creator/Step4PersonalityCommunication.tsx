import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Sparkles,
  Volume2,
  Smile,
  Zap,
  Heart,
  ShieldCheck,
  Check,
  RotateCcw,
  Play,
  Square,
  Briefcase,
  Sun,
  Award,
  Coffee,
  Flame,
  Clock,
  Compass,
  Search,
  Bot,
  Activity,
  MessageSquareQuote,
  FileText,
  ChevronDown,
  CircleOff,
  Loader2,
  Sliders,
  Move,
  Info,
  Plus,
  Trash2,
  Building,
  Wrench,
  Inbox,
  Laptop
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { InfoTooltip } from "../ui/Tooltip";
import { COMMUNICATION_STYLES, getInitialAgentData, AURA_VOICES, AGENT_PURPOSES, INDUSTRY_FEW_SHOT_PRESETS } from "./constants";
import { AgentConfig, AgentPersonality, FewShotExample } from "../../types";
import { toast } from "sonner";

interface Step4PersonalityCommunicationProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

// Tone icons mapping
const TONE_ICONS: Record<string, React.ElementType> = {
  Professional: Briefcase,
  Friendly: Smile,
  Warm: Sun,
  Casual: Coffee,
  Formal: Award,
  Energetic: Zap,
  Empathetic: Heart,
  Confident: ShieldCheck,
  Persuasive: Flame,
  Enthusiastic: Sparkles,
  None: CircleOff
};

// Custom Tone Dropdown Component with Icons
interface CustomToneSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  isSecondary?: boolean;
}

function CustomToneSelect({
  value,
  onChange,
  options,
  isSecondary = false
}: CustomToneSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const SelectedIcon = TONE_ICONS[value] || Smile;
  const isNone = value === "None";

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] font-semibold cursor-pointer transition-all hover:bg-[var(--color-surface)]"
      >
        <div className="flex items-center gap-2 truncate">
          <div
            className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
              isNone
                ? "text-[var(--color-muted)]"
                : "text-[var(--color-primary)]"
            }`}
          >
            <SelectedIcon className="w-3.5 h-3.5" />
          </div>
          <span className="truncate">
            {isSecondary && isNone ? "None (Single Tone)" : isSecondary ? `+ ${value}` : value}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--color-muted)] shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[var(--color-primary)]" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-elevated p-1 space-y-0.5 animate-fade-in">
          {options.map((opt) => {
            const IconComponent = TONE_ICONS[opt] || Smile;
            const isSelected = value === opt;
            const isOptionNone = opt === "None";

            return (
              <div
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.25rem)] text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold"
                    : "text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "text-[var(--color-primary)]"
                        : "text-[var(--color-muted)]"
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                  <span className="truncate">
                    {isSecondary && isOptionNone ? "None (Single Tone)" : opt}
                  </span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0 stroke-[2.5]" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Intensity helper
function getIntensityLabel(val: number): string {
  if (val <= 20) return "Very Low";
  if (val <= 40) return "Low";
  if (val <= 60) return "Balanced";
  if (val <= 80) return "High";
  return "Very High";
}

// Semi-Circle Gauge Component for Core Traits (Row 2)
interface SemiCircleGaugeProps {
  value: number;
  label: string;
  description: string;
  icon: React.ElementType;
  recommendedValue?: number;
  onChange: (val: number) => void;
}

function SemiCircleGaugeCard({
  value,
  label,
  description,
  icon: Icon,
  recommendedValue,
  onChange
}: SemiCircleGaugeProps) {
  const intensity = getIntensityLabel(value);
  const radius = 38;
  const strokeWidth = 7;
  const halfCircumference = Math.PI * radius;
  const strokeDashoffset = halfCircumference - (value / 100) * halfCircumference;

  const presetLevels = [
    { label: "V.Low", val: 20 },
    { label: "Low", val: 40 },
    { label: "Mod", val: 60 },
    { label: "High", val: 80 },
    { label: "V.High", val: 95 }
  ];

  return (
    <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs flex flex-col justify-between space-y-3 transition-all hover:border-[var(--color-border-strong,var(--color-border))] select-none">
      {/* Card Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--color-heading)] leading-none">
              {label}
            </h4>
            <span className="text-[10px] text-[var(--color-muted)] mt-0.5 block">
              {description}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge
            variant={value >= 80 ? "primary" : value >= 50 ? "neutral" : "warning"}
            size="sm"
            className="text-[10px] font-semibold"
          >
            {intensity}
          </Badge>
          {recommendedValue !== undefined && (
            <span className="text-[9px] text-[var(--color-muted)] font-medium">
              Rec: <strong className="text-[var(--color-primary)]">{recommendedValue}%</strong>
            </span>
          )}
        </div>
      </div>

      {/* Center Gauge Visualization */}
      <div className="flex flex-col items-center justify-center py-1">
        <div className="relative w-36 h-20 flex items-end justify-center overflow-hidden">
          <svg viewBox="0 0 100 55" className="w-full h-full">
            <path
              d="M 12 50 A 38 38 0 0 1 88 50"
              fill="none"
              stroke="var(--color-surface-muted)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <path
              d="M 12 50 A 38 38 0 0 1 88 50"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth={strokeWidth}
              strokeDasharray={halfCircumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-300 ease-out"
            />
          </svg>
          <div className="absolute bottom-0 inset-x-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-extrabold text-[var(--color-heading)] tracking-tight leading-none">
              {value}%
            </span>
            <span className="text-[9px] font-medium text-[var(--color-muted)] uppercase tracking-wider mt-0.5">
              Intensity
            </span>
          </div>
        </div>
      </div>

      {/* Stepped Scale & Fine-Tuning Controls */}
      <div className="space-y-2 pt-1 border-t border-[var(--color-border)]/60">
        <div className="grid grid-cols-5 gap-1">
          {presetLevels.map((lvl) => {
            const isMatch =
              value >= lvl.val - 10 && (lvl.val === 95 ? value >= 90 : value < lvl.val + 10);

            return (
              <button
                key={lvl.val}
                type="button"
                onClick={() => onChange(lvl.val)}
                className={`py-1 text-[10px] font-semibold rounded-[var(--radius-main,0.25rem)] transition-all cursor-pointer text-center ${
                  isMatch
                    ? "bg-[var(--color-primary)] text-white shadow-2xs scale-[1.02]"
                    : "bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-border)]/60"
                }`}
              >
                {lvl.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 5-Axis Radar Config
interface AxisDefinition {
  key: keyof AgentPersonality;
  label: string;
  icon: React.ElementType;
  description: string;
  angle: number; // Angle in degrees, 0 = top (-90 deg standard math)
  labelAnchor: {
    dx: number;
    dy: number;
    align: "left" | "right" | "center";
  };
}

const FIVE_AXES: AxisDefinition[] = [
  {
    key: "patience",
    label: "Patience",
    icon: Clock,
    description: "Tolerant and willing to re-explain without rushing",
    angle: 0, // Top
    labelAnchor: { dx: 0, dy: -38, align: "center" }
  },
  {
    key: "energy",
    label: "Energy",
    icon: Zap,
    description: "Conversational vitality and upbeat enthusiasm",
    angle: 72, // Top-Right
    labelAnchor: { dx: 42, dy: -12, align: "left" }
  },
  {
    key: "humor",
    label: "Humor",
    icon: Sparkles,
    description: "Lighthearted charm and polite witty warmth",
    angle: 144, // Bottom-Right
    labelAnchor: { dx: 36, dy: 30, align: "left" }
  },
  {
    key: "assertiveness",
    label: "Assertiveness",
    icon: ShieldCheck,
    description: "Directness and steering calls toward key goals",
    angle: 216, // Bottom-Left
    labelAnchor: { dx: -36, dy: 30, align: "right" }
  },
  {
    key: "curiosity",
    label: "Curiosity",
    icon: Search,
    description: "Asking proactive questions to uncover caller needs",
    angle: 288, // Top-Left
    labelAnchor: { dx: -42, dy: -12, align: "right" }
  }
];

// Interactive 5-Axis Radar Chart Component
interface InteractivePersonalityRadarProps {
  personality: AgentPersonality;
  onChange: (key: keyof AgentPersonality, val: number) => void;
}

function InteractivePersonalityRadar({
  personality,
  onChange
}: InteractivePersonalityRadarProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeDraggingAxis, setActiveDraggingAxis] = useState<keyof AgentPersonality | null>(null);
  const [hoveredAxis, setHoveredAxis] = useState<keyof AgentPersonality | null>(null);

  const cx = 250;
  const cy = 230;
  const maxRadius = 145;
  const minRadius = 25; // 10%

  // Calculate coordinates for an angle and radius
  const getCoordinates = useCallback((angleDeg: number, radius: number) => {
    // 0 deg is at top (12 o'clock), converting to radians: -90 deg offset
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleRad),
      y: cy + radius * Math.sin(angleRad)
    };
  }, [cx, cy]);

  // Radius for a given value (0 to 100)
  const getRadiusForValue = useCallback((val: number) => {
    const clamped = Math.max(10, Math.min(100, val));
    return minRadius + (clamped / 100) * (maxRadius - minRadius);
  }, [minRadius, maxRadius]);

  // Value from distance on axis
  const calculateValueFromPoint = useCallback((clientX: number, clientY: number, axisAngle: number) => {
    if (!svgRef.current) return 50;
    const rect = svgRef.current.getBoundingClientRect();
    
    // SVG viewBox coordinates
    const scaleX = 500 / rect.width;
    const scaleY = 460 / rect.height;
    
    const mouseSvgX = (clientX - rect.left) * scaleX;
    const mouseSvgY = (clientY - rect.top) * scaleY;

    // Vector from center to mouse
    const dx = mouseSvgX - cx;
    const dy = mouseSvgY - cy;

    // Axis unit vector
    const angleRad = ((axisAngle - 90) * Math.PI) / 180;
    const ux = Math.cos(angleRad);
    const uy = Math.sin(angleRad);

    // Project mouse onto axis line (dot product)
    const projectedDistance = dx * ux + dy * uy;

    // Clamp between minRadius and maxRadius
    const clampedDist = Math.max(minRadius, Math.min(maxRadius, projectedDistance));
    const normalizedVal = ((clampedDist - minRadius) / (maxRadius - minRadius)) * 100;
    return Math.round(normalizedVal / 5) * 5; // Snap to multiples of 5
  }, [cx, cy, minRadius, maxRadius]);

  // Drag handlers
  const handlePointerDown = (key: keyof AgentPersonality, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDraggingAxis(key);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDraggingAxis) return;
    e.preventDefault();
    const axisDef = FIVE_AXES.find((a) => a.key === activeDraggingAxis);
    if (!axisDef) return;

    const newVal = calculateValueFromPoint(e.clientX, e.clientY, axisDef.angle);
    onChange(activeDraggingAxis, newVal);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDraggingAxis) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch (_) {}
      setActiveDraggingAxis(null);
    }
  };

  // Polygon points path
  const polygonPoints = useMemo(() => {
    return FIVE_AXES.map((axis) => {
      const val = personality[axis.key] ?? 50;
      const r = getRadiusForValue(val);
      const { x, y } = getCoordinates(axis.angle, r);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [personality, getRadiusForValue, getCoordinates]);

  // Concentric Rings (20%, 40%, 60%, 80%, 100%)
  const gridRings = [20, 40, 60, 80, 100];

  return (
    <div className="relative w-full flex flex-col items-center select-none">
      <div className="relative w-full max-w-[540px] aspect-[500/460] mx-auto">
        <svg
          ref={svgRef}
          viewBox="0 0 500 460"
          className="w-full h-full overflow-visible touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <defs>
            {/* Ambient Radial Glow */}
            <radialGradient id="radarCenterGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.25" />
              <stop offset="60%" stopColor="var(--color-primary)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </radialGradient>

            {/* Polygon Shape Fill Gradient */}
            <radialGradient id="polygonGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.55" />
              <stop offset="85%" stopColor="var(--color-primary)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.15" />
            </radialGradient>

            {/* Control Point Glow Filter */}
            <filter id="pointGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="var(--color-primary)" floodOpacity="0.6" />
            </filter>

            <filter id="activePointGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="var(--color-primary)" floodOpacity="0.9" />
            </filter>
          </defs>

          {/* Background Ambient Glow */}
          <circle cx={cx} cy={cy} r={maxRadius} fill="url(#radarCenterGlow)" />

          {/* Alternating Pentagon Band Fills for 3D Radar Depth */}
          {gridRings.map((percent, idx) => {
            const r = getRadiusForValue(percent);
            const ringPoints = FIVE_AXES.map((axis) => {
              const { x, y } = getCoordinates(axis.angle, r);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(" ");

            const isOuter = percent === 100;
            const isMid = percent === 60;

            return (
              <g key={percent}>
                {/* Crisp Web Grid Polygonal Lines with alternating shaded facets */}
                <polygon
                  points={ringPoints}
                  fill={idx % 2 === 0 ? "var(--color-surface-muted)" : "var(--color-surface)"}
                  fillOpacity={isOuter ? "0.4" : "0.2"}
                  stroke="var(--color-border-strong, var(--color-border))"
                  strokeWidth={isOuter ? "2" : isMid ? "1.5" : "1.2"}
                  className="transition-all"
                />

                {/* Level Percentage Badges on Vertical Top Spoke */}
                <g>
                  <rect
                    x={cx - 13}
                    y={cy - r - 7}
                    width="26"
                    height="13"
                    rx="3"
                    fill="var(--color-surface)"
                    stroke="var(--color-border)"
                    strokeWidth="1"
                    className="opacity-95 shadow-2xs"
                  />
                  <text
                    x={cx}
                    y={cy - r}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-[9px] font-mono font-bold fill-[var(--color-heading)] select-none opacity-80"
                  >
                    {percent}%
                  </text>
                </g>
              </g>
            );
          })}

          {/* 5 Prominent Radial Axis Spoke Lines from Center to Outer Rim */}
          {FIVE_AXES.map((axis) => {
            const outerCoord = getCoordinates(axis.angle, maxRadius);
            const isHovered = hoveredAxis === axis.key || activeDraggingAxis === axis.key;

            return (
              <g key={axis.key}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={outerCoord.x}
                  y2={outerCoord.y}
                  stroke={isHovered ? "var(--color-primary)" : "var(--color-border-strong, var(--color-border))"}
                  strokeWidth={isHovered ? "2.5" : "1.5"}
                  strokeDasharray={isHovered ? "none" : "4 3"}
                  className="transition-colors duration-200"
                />
                {/* Outer Axis End Cap Marker */}
                <circle
                  cx={outerCoord.x}
                  cy={outerCoord.y}
                  r={isHovered ? "4" : "3"}
                  fill={isHovered ? "var(--color-primary)" : "var(--color-border-strong, var(--color-border))"}
                  className="transition-all duration-150"
                />
              </g>
            );
          })}

          {/* Active Connective Rays from Center to Draggable Control Points */}
          {FIVE_AXES.map((axis) => {
            const val = personality[axis.key] ?? 50;
            const r = getRadiusForValue(val);
            const { x, y } = getCoordinates(axis.angle, r);
            const isDragging = activeDraggingAxis === axis.key;
            const isHovered = hoveredAxis === axis.key;

            return (
              <line
                key={`ray-${axis.key}`}
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="var(--color-primary)"
                strokeWidth={isDragging ? "2.5" : isHovered ? "2" : "1.2"}
                strokeOpacity={isDragging ? "1" : isHovered ? "0.8" : "0.5"}
                className="transition-all"
              />
            );
          })}

          {/* Active Personality Polygon Shape */}
          <polygon
            points={polygonPoints}
            fill="url(#polygonGradient)"
            stroke="var(--color-primary)"
            strokeWidth="3"
            strokeLinejoin="round"
            className="transition-all duration-75 filter drop-shadow-md"
          />

          {/* Interactive Control Points on Each Axis */}
          {FIVE_AXES.map((axis) => {
            const val = personality[axis.key] ?? 50;
            const r = getRadiusForValue(val);
            const { x, y } = getCoordinates(axis.angle, r);
            const isDragging = activeDraggingAxis === axis.key;
            const isHovered = hoveredAxis === axis.key;

            return (
              <g
                key={axis.key}
                className="cursor-grab active:cursor-grabbing transition-transform"
                onPointerDown={(e) => handlePointerDown(axis.key, e)}
                onMouseEnter={() => setHoveredAxis(axis.key)}
                onMouseLeave={() => setHoveredAxis(null)}
              >
                {/* Generous Touch / Hit Area */}
                <circle
                  cx={x}
                  cy={y}
                  r={26}
                  fill="transparent"
                />

                {/* Outer Ripple / Pulse Ring */}
                {(isDragging || isHovered) && (
                  <circle
                    cx={x}
                    cy={y}
                    r={isDragging ? 18 : 14}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="2"
                    strokeOpacity={isDragging ? "0.9" : "0.6"}
                    className="animate-ping [animation-duration:2s]"
                  />
                )}

                {/* Outer High-Contrast Point Ring */}
                <circle
                  cx={x}
                  cy={y}
                  r={isDragging ? 12 : isHovered ? 10.5 : 9}
                  fill="var(--color-primary)"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  filter={isDragging ? "url(#activePointGlow)" : isHovered ? "url(#pointGlow)" : "none"}
                  className="transition-all duration-150 shadow-md"
                />

                {/* Inner Core Bullet */}
                <circle
                  cx={x}
                  cy={y}
                  r={isDragging ? 4.5 : isHovered ? 4 : 3}
                  fill="#ffffff"
                  className="transition-all duration-150"
                />

                {/* Live Value Tag on Point while Hovering or Dragging */}
                {(isDragging || isHovered) && (
                  <g transform={`translate(${x}, ${y - 20})`}>
                    <rect
                      x="-20"
                      y="-12"
                      width="40"
                      height="17"
                      rx="4"
                      fill="var(--color-heading)"
                      stroke="var(--color-border)"
                      strokeWidth="1"
                      className="shadow-lg"
                    />
                    <text
                      x="0"
                      y="-1"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--color-surface)"
                      className="text-[10px] font-bold font-mono"
                    >
                      {val}%
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Central Anchor Bullet */}
          <circle cx={cx} cy={cy} r={4.5} fill="var(--color-primary)" stroke="#ffffff" strokeWidth="1.5" />
        </svg>

        {/* Dynamic HTML Integrated Parameter Badges Around Radar Chart */}
        {FIVE_AXES.map((axis) => {
          const val = personality[axis.key] ?? 50;
          const intensity = getIntensityLabel(val);
          const IconComp = axis.icon;
          const isSelected = hoveredAxis === axis.key || activeDraggingAxis === axis.key;

          // Geometric positioning styles
          let posClass = "";
          if (axis.angle === 0) {
            // Top (Patience)
            posClass = "top-0 left-1/2 -translate-x-1/2 -translate-y-2";
          } else if (axis.angle === 72) {
            // Top Right (Energy)
            posClass = "top-[18%] right-0 translate-x-1";
          } else if (axis.angle === 144) {
            // Bottom Right (Humor)
            posClass = "bottom-[14%] right-1 translate-x-1";
          } else if (axis.angle === 216) {
            // Bottom Left (Assertiveness)
            posClass = "bottom-[14%] left-1 -translate-x-1";
          } else {
            // Top Left (Curiosity)
            posClass = "top-[18%] left-0 -translate-x-1";
          }

          return (
            <div
              key={axis.key}
              onMouseEnter={() => setHoveredAxis(axis.key)}
              onMouseLeave={() => setHoveredAxis(null)}
              className={`absolute ${posClass} transition-all duration-200 pointer-events-auto max-w-[150px]`}
            >
              <div
                className={`p-2 rounded-[var(--radius-main,0.375rem)] border text-left transition-all ${
                  isSelected
                    ? "bg-[var(--color-surface)] border-[var(--color-primary)] shadow-md ring-1 ring-[var(--color-primary)]/40 scale-105 z-20"
                    : "bg-[var(--color-surface)]/90 backdrop-blur-xs border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] shadow-2xs z-10"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 pb-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-[var(--radius-main,0.25rem)] flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-[var(--color-primary)] text-white"
                          : "bg-[var(--color-surface-muted)] text-[var(--color-primary)]"
                      }`}
                    >
                      <IconComp className="w-3 h-3" />
                    </div>
                    <span className="text-xs font-bold text-[var(--color-heading)] truncate">
                      {axis.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                    {val}%
                  </span>
                  <span className="text-[10px] text-[var(--color-muted)] font-medium">
                    · {intensity}
                  </span>
                </div>

                <p className="text-[9px] text-[var(--color-muted)] leading-tight mt-1 line-clamp-2">
                  {axis.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interaction Guidance Footer */}
      <div className="w-full mt-2 pt-2 border-t border-[var(--color-border)]/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[var(--color-muted)]">
        <div className="flex items-center gap-1.5">
          <Move className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0 animate-pulse" />
          <span>
            <strong>Interactive Studio:</strong> Drag any point inward/outward to shape personality dimensions.
          </span>
        </div>

        {/* Low to High Scale Indicator */}
        <div className="flex items-center gap-2 bg-[var(--color-surface-muted)]/80 px-2.5 py-1 rounded-[var(--radius-main,0.25rem)] border border-[var(--color-border)] shrink-0 font-medium">
          <span className="text-[10px] text-[var(--color-muted)]">Center (10% Low)</span>
          <div className="w-12 h-1.5 bg-gradient-to-r from-amber-400 via-[var(--color-primary)] to-emerald-500 rounded-full" />
          <span className="text-[10px] text-[var(--color-heading)] font-semibold">Outer (100% High)</span>
        </div>
      </div>
    </div>
  );
}

export function Step4PersonalityCommunication({
  agentData,
  setAgentData
}: Step4PersonalityCommunicationProps) {
  // Voice Preview State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selectedVoiceId = agentData.voice?.voice || "aura-orion-en";
  const selectedVoiceObj = AURA_VOICES.find((v) => v.id === selectedVoiceId) || AURA_VOICES[0];

  const currentStyles = (agentData.communication_style || "Professional").split("+").map((s) => s.trim());
  const primaryStyle = currentStyles[0] || "Professional";
  const secondaryStyle = currentStyles[1] || "None";

  const personality = agentData.personality || getInitialAgentData().personality;

  // Find matching purpose or default fallback
  const matchedPurpose = useMemo(() => {
    return (
      AGENT_PURPOSES.find(
        (p) =>
          p.defaultRole.toLowerCase() === (agentData.role || "").toLowerCase() ||
          p.title.toLowerCase() === (agentData.role || "").toLowerCase() ||
          agentData.name?.toLowerCase().includes(p.id.replace(/_/g, " "))
      ) ||
      AGENT_PURPOSES.find((p) => p.id === "custom") ||
      AGENT_PURPOSES[0]
    );
  }, [agentData.role, agentData.name]);

  const recommendedStyles = useMemo(() => {
    const parts = (matchedPurpose.defaultCommunicationStyle || "Professional + Friendly")
      .split("+")
      .map((s) => s.trim());
    return {
      primary: parts[0] || "Professional",
      secondary: parts[1] || "None"
    };
  }, [matchedPurpose]);

  // Cleanup all audio on unmount
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    return () => {
      stopAudio();
    };
  }, []);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setIsLoadingAudio(false);
  };

  const handleStyleChange = (primary: string, secondary: string) => {
    let combined = primary;
    if (secondary && secondary !== "None" && secondary !== primary) {
      combined = `${primary} + ${secondary}`;
    }
    setAgentData({
      ...agentData,
      communication_style: combined
    });
  };

  const updatePersonality = (key: keyof AgentPersonality, val: number) => {
    setAgentData((prev) => ({
      ...prev,
      personality: { ...prev.personality, [key]: val }
    }));
  };

  const resetToRecommended = () => {
    const targetDefaults = matchedPurpose.defaultPersonality || getInitialAgentData().personality;
    setAgentData((prev) => ({
      ...prev,
      communication_style: matchedPurpose.defaultCommunicationStyle || "Professional + Friendly",
      response_length: matchedPurpose.defaultResponseLength || "short",
      personality: { ...prev.personality, ...targetDefaults },
      voice: {
        ...prev.voice,
        speed: matchedPurpose.recommendedSpeed ?? prev.voice?.speed ?? 1.0,
        voice: matchedPurpose.recommendedVoiceId || prev.voice?.voice || "aura-orion-en"
      },
      llm: {
        ...prev.llm,
        temperature: matchedPurpose.recommendedTemperature ?? prev.llm?.temperature ?? 0.4
      }
    }));
    toast.success(`Reset to recommended settings for ${matchedPurpose.title}`);
  };

  // Few-Shot Golden Dialogues State
  const [showAddExample, setShowAddExample] = useState(false);
  const [newExampleTitle, setNewExampleTitle] = useState("");
  const [newExampleIndustry, setNewExampleIndustry] = useState("general");
  const [newCallerTurn, setNewCallerTurn] = useState("");
  const [newAssistantTurn, setNewAssistantTurn] = useState("");

  const fewShotExamples: FewShotExample[] = agentData.few_shot_examples || (
    INDUSTRY_FEW_SHOT_PRESETS.filter(p => p.industry === "support" || p.industry === "real_estate")
  );

  const handleAddFewShotExample = () => {
    if (!newExampleTitle.trim() || !newCallerTurn.trim() || !newAssistantTurn.trim()) {
      toast.error("Please fill in the title, caller turn, and assistant turn.");
      return;
    }
    const newEx: FewShotExample = {
      title: newExampleTitle.trim(),
      industry: newExampleIndustry,
      dialogue: [
        { role: "user", content: newCallerTurn.trim() },
        { role: "assistant", content: newAssistantTurn.trim() }
      ]
    };
    setAgentData((prev) => ({
      ...prev,
      few_shot_examples: [...fewShotExamples, newEx]
    }));
    setNewExampleTitle("");
    setNewCallerTurn("");
    setNewAssistantTurn("");
    setShowAddExample(false);
    toast.success("Golden dialogue example added!");
  };

  const handleRemoveFewShotExample = (index: number) => {
    const updated = fewShotExamples.filter((_, i) => i !== index);
    setAgentData((prev) => ({
      ...prev,
      few_shot_examples: updated
    }));
  };

  const handleLoadIndustryPreset = (industry: string) => {
    const preset = INDUSTRY_FEW_SHOT_PRESETS.find((p) => p.industry === industry);
    if (!preset) return;
    const exists = fewShotExamples.some((e) => e.title === preset.title);
    if (exists) {
      toast.info("This preset example is already added.");
      return;
    }
    setAgentData((prev) => ({
      ...prev,
      few_shot_examples: [...fewShotExamples, preset]
    }));
    toast.success(`Loaded "${preset.title}" preset!`);
  };

  // Structured human-readable traits breakdown for right panel
  const getHumanReadableTraits = () => {
    const p = personality;
    const traitsList: Array<{
      title: string;
      desc: string;
      icon: React.ElementType;
      badge: string;
    }> = [];

    // Patience
    if (p.patience >= 80) {
      traitsList.push({
        title: "Very Patient & Unrushed",
        desc: "Calmly handles pauses and repeats information willingly.",
        icon: Clock,
        badge: "High Patience"
      });
    } else if (p.patience <= 40) {
      traitsList.push({
        title: "Fast-Paced & Direct",
        desc: "Values quick conversational turnover without extra pauses.",
        icon: Clock,
        badge: "Fast Pace"
      });
    } else {
      traitsList.push({
        title: "Balanced Patience",
        desc: "Maintains steady conversational pacing.",
        icon: Clock,
        badge: "Balanced"
      });
    }

    // Energy
    if (p.energy >= 80) {
      traitsList.push({
        title: "Naturally Energetic",
        desc: "Radiates upbeat vitality and lively enthusiasm.",
        icon: Zap,
        badge: "High Energy"
      });
    } else if (p.energy <= 40) {
      traitsList.push({
        title: "Calm & Grounded",
        desc: "Delivers steady, composed, and tranquil cadence.",
        icon: Zap,
        badge: "Composed"
      });
    }

    // Assertiveness
    if (p.assertiveness >= 75) {
      traitsList.push({
        title: "Decisive & Goal-Driven",
        desc: "Directly steers dialogue toward confirmed outcomes.",
        icon: ShieldCheck,
        badge: "Assertive"
      });
    } else if (p.assertiveness <= 40) {
      traitsList.push({
        title: "Gentle & Receptive",
        desc: "Allows the caller to lead conversation topics entirely.",
        icon: ShieldCheck,
        badge: "Receptive"
      });
    } else {
      traitsList.push({
        title: "Balanced Assertiveness",
        desc: "Guides callers politely while addressing their inquiries.",
        icon: ShieldCheck,
        badge: "Balanced"
      });
    }

    // Curiosity
    if (p.curiosity >= 75) {
      traitsList.push({
        title: "Highly Curious & Proactive",
        desc: "Asks engaging diagnostic questions to clarify caller intent.",
        icon: Search,
        badge: "Inquisitive"
      });
    } else if (p.curiosity <= 40) {
      traitsList.push({
        title: "Direct Answerer",
        desc: "Answers immediate questions without excess probing.",
        icon: Search,
        badge: "Direct"
      });
    }

    // Humor
    if (p.humor >= 60) {
      traitsList.push({
        title: "Witty & Lighthearted",
        desc: "Infuses subtle charm and warm interpersonal wit.",
        icon: Sparkles,
        badge: "Witty"
      });
    } else {
      traitsList.push({
        title: "Serious & Business-First",
        desc: "Maintains strictly factual and focused demeanor.",
        icon: Briefcase,
        badge: "Focused"
      });
    }

    return traitsList.slice(0, 4);
  };

  // Generate dynamic live personality summary sentence
  const getDynamicPersonalitySummary = () => {
    const p = personality;
    const parts: string[] = [];

    // Patience & Curiosity
    if (p.patience >= 75 && p.curiosity >= 70) {
      parts.push("patient and curious");
    } else if (p.patience >= 75) {
      parts.push("exceptionally patient and reassuring");
    } else if (p.curiosity >= 70) {
      parts.push("proactive and inquisitive");
    } else {
      parts.push("composed and direct");
    }

    // Energy & Tone
    if (p.energy >= 75) {
      parts.push("communicates with natural energy and vitality");
    } else if (p.energy <= 40) {
      parts.push("speaks with calm, grounded clarity");
    } else {
      parts.push("maintains a balanced conversational rhythm");
    }

    // Assertiveness & Humor
    let closing = "while maintaining a professional yet approachable conversation style.";
    if (p.assertiveness >= 75) {
      closing = "and decisively guides callers toward confirmed next steps.";
    } else if (p.humor >= 60) {
      closing = "infusing subtle charm and welcoming conversational warmth.";
    }

    return `Your agent is ${parts.join(", ")}, ${closing}`;
  };

  // Dynamic dialogue generation for interactive preview
  const getDialoguePreview = () => {
    const len = agentData.response_length || "short";
    const prof = personality.professionalism ?? 85;
    const friend = personality.friendliness ?? 90;
    const emp = personality.empathy ?? 80;
    const conf = personality.confidence ?? 85;
    const energy = personality.energy ?? 70;
    const patience = personality.patience ?? 90;
    const assert = personality.assertiveness ?? 50;
    const curiosity = personality.curiosity ?? 75;
    const humor = personality.humor ?? 10;

    let greeting = "Hello! Thank you for calling us today.";
    if (primaryStyle === "Casual" || prof <= 40) {
      greeting = energy >= 75 ? "Hey there! Great to connect with you today!" : "Hey there! Thanks for calling in today.";
    } else if (primaryStyle === "Formal" || prof >= 88) {
      greeting = conf >= 85
        ? "Good day. Thank you for contacting our office; it is my pleasure to assist you."
        : "Good day. Thank you for reaching out to our team today.";
    } else if (primaryStyle === "Energetic" || primaryStyle === "Enthusiastic" || energy >= 80) {
      greeting = "Hello! Fantastic to connect with you today!";
    } else if (primaryStyle === "Empathetic" || primaryStyle === "Warm" || emp >= 85) {
      greeting = "Hello! Thank you so much for calling. I'm really glad we're connecting today.";
    } else if (primaryStyle === "Persuasive") {
      greeting = "Hello! Thanks for taking a moment to speak with me today.";
    } else if (friend >= 85) {
      greeting = "Hi there! Thank you so much for reaching out to us.";
    }

    let body = "";
    if (len === "short") {
      if (emp >= 80) {
        body = "I completely understand what you need, and I'm here to help you get this resolved quickly.";
      } else if (assert >= 75 || conf >= 85) {
        body = "I'll guide you directly to the optimal solution and take care of the details right away.";
      } else if (primaryStyle === "Persuasive") {
        body = "I'd love to share how our tailored solutions can deliver immediate results for your goals.";
      } else if (humor >= 60 || primaryStyle === "Casual") {
        body = "I'm happy to help you get everything sorted out without any fuss!";
      } else if (patience >= 85) {
        body = "Please take your time—I'm ready whenever you'd like to begin.";
      } else {
        body = "I'd be glad to help you with our services today.";
      }
    } else if (len === "balanced") {
      if (emp >= 80) {
        body = "I completely understand what you're looking for, and I'm right here to take care of everything. Let me pull up your details so we can find the best option for your situation.";
      } else if (assert >= 75 || conf >= 85) {
        body = "I will guide you directly to the best solution for your requirements and coordinate all the next steps seamlessly. Let's look into the exact details right now.";
      } else if (primaryStyle === "Persuasive") {
        body = "I'd love to highlight how our proven solutions streamline your process and maximize value. Let's review the top benefits that align with what you're trying to achieve.";
      } else if (humor >= 60 || primaryStyle === "Casual") {
        body = "I'm happy to help you get everything sorted out smoothly—no complicated steps or headache. Let's take a look at what we've got.";
      } else if (patience >= 85) {
        body = "Please take all the time you need. I'm happy to walk through each detail at your own pace so you feel completely confident.";
      } else {
        body = "I'm here to assist you with our services, verify your details, and guide you through the process. Let me quickly check the records for you.";
      }
    } else {
      if (emp >= 80) {
        body = "I completely understand how important this is to you, and I am right here to take care of each detail. I will personally guide you through every option step-by-step, review the requirements together, and ensure everything is clear and stress-free.";
      } else if (assert >= 75 || conf >= 85) {
        body = "I will provide a direct, strategic recommendation tailored specifically to your objectives. We will review the key milestones, outline the exact timeline, and ensure immediate execution without any delays.";
      } else if (primaryStyle === "Persuasive") {
        body = "I'm excited to walk you through how our specialized solutions can dramatically increase your efficiency and return on investment. I'll outline the key advantages, comparative benefits, and custom options available for you.";
      } else if (patience >= 85) {
        body = "Please feel free to take all the time you need throughout our conversation. I will gladly explain each step as thoroughly as you'd like, pause for any questions, and ensure you have total clarity before moving forward.";
      } else {
        body = "I would be happy to give you a comprehensive overview of our available options, explain each benefit step-by-step, and ensure all your specific requirements are fully addressed.";
      }
    }

    let closing = "";
    if (curiosity >= 75) {
      closing = "To make sure I get you the exact right fit, could you share a bit more about your main priority today?";
    } else if (assert >= 75) {
      closing = "Shall we go ahead and confirm the next steps for you right now?";
    } else if (primaryStyle === "Casual" || friend >= 85) {
      closing = "What can I help you with first?";
    } else if (primaryStyle === "Formal" || prof >= 88) {
      closing = "How may I best assist you with your inquiry?";
    } else {
      closing = "What questions can I answer for you today?";
    }

    return `“${greeting} ${body} ${closing}”`;
  };

  const handlePlaySampleVoice = async () => {
    if (isPlayingAudio || isLoadingAudio) {
      stopAudio();
      return;
    }

    stopAudio();
    setIsLoadingAudio(true);

    const textToSpeak = getDialoguePreview().replace(/“|”/g, "");
    const voiceId = agentData.voice?.voice || "aura-orion-en";

    try {
      const token = localStorage.getItem("desire_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch("http://localhost:8000/api/v1/voice/sample-speech", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: textToSpeak, voice: voiceId })
      });

      if (!response.ok) {
        throw new Error(`Voice synthesis failed (${response.status})`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      const speed = agentData.voice?.speed || 1.0;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));

      audio.onended = () => {
        setIsPlayingAudio(false);
        setIsLoadingAudio(false);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlayingAudio(false);
        setIsLoadingAudio(false);
        audioRef.current = null;
        toast.error("Audio playback error.");
      };

      audioRef.current = audio;
      setIsLoadingAudio(false);
      setIsPlayingAudio(true);
      await audio.play();
    } catch (err: any) {
      stopAudio();
      toast.error(err?.message || "Failed to generate sample voice.");
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* 1. Header with Visual Waveform Accent & Reset Button */}
      <div className="border-b border-[var(--color-border)] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm sm:text-base font-bold text-[var(--color-heading)] tracking-tight flex items-center gap-1.5">
              <span>Personality &amp; Communication Style</span>
              <InfoTooltip
                content="Define how your AI agent communicates, responds, behaves, and connects with callers."
                position="top"
              />
            </h2>
            <Badge variant="primary" size="sm" className="text-[10px]">
              AI Studio
            </Badge>
            {matchedPurpose && (
              <Badge variant="neutral" size="sm" className="text-[10px] flex items-center gap-1 bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20 font-medium">
                <Sparkles className="w-2.5 h-2.5" />
                <span>Profile: {matchedPurpose.title}</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Abstract AI Waveform Visualization & Reset */}
        <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
          <div className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)]" title="AI Voice Persona Modulation">
            <Activity className="w-3.5 h-3.5 text-[var(--color-primary)] animate-pulse" />
            <div className="flex items-center gap-0.5 h-3.5 px-1">
              <span className="w-0.5 h-2 bg-[var(--color-primary)]/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-0.5 h-3 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-0.5 h-1.5 bg-[var(--color-primary)]/40 rounded-full animate-bounce" />
              <span className="w-0.5 h-3.5 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:-0.25s]" />
              <span className="w-0.5 h-2 bg-[var(--color-primary)]/70 rounded-full animate-bounce [animation-delay:-0.05s]" />
            </div>
            <span className="text-[10px] font-semibold text-[var(--color-heading)] ml-1">
              Live Modulation
            </span>
          </div>

          <button
            type="button"
            onClick={resetToRecommended}
            className="px-2.5 py-1.5 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-heading)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] rounded-[var(--radius-main,0.375rem)] flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title={`Reset personality to recommended defaults for ${matchedPurpose.title}`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset to Recommended</span>
          </button>
        </div>
      </div>

      {/* Row 1: Tone & Demeanor + Response Length */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Communication Tone & Demeanor */}
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <Smile className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                  <span>Communication Tone &amp; Demeanor</span>
                  <InfoTooltip
                    content="Set the primary and secondary conversational tone to mold the agent's attitude and interpersonal style."
                    position="top"
                  />
                </h3>
              </div>
            </div>
            {matchedPurpose && (
              <span className="text-[10px] font-semibold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-[var(--radius-main,0.25rem)]">
                Rec: {matchedPurpose.defaultCommunicationStyle}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Primary Tone */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--color-heading)] flex items-center gap-1">
                  Primary Tone <span className="text-[var(--color-danger)]">*</span>
                </span>
                {recommendedStyles.primary && (
                  <span className="text-[9px] text-[var(--color-muted)]">
                    Rec: <strong className="text-[var(--color-primary)]">{recommendedStyles.primary}</strong>
                  </span>
                )}
              </div>
              <CustomToneSelect
                value={primaryStyle}
                onChange={(val) => handleStyleChange(val, secondaryStyle)}
                options={COMMUNICATION_STYLES}
              />
            </div>

            {/* Secondary Tone */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--color-heading)]">
                  Secondary Tone (Optional)
                </span>
                {recommendedStyles.secondary && (
                  <span className="text-[9px] text-[var(--color-muted)]">
                    Rec: <strong className="text-[var(--color-primary)]">{recommendedStyles.secondary}</strong>
                  </span>
                )}
              </div>
              <CustomToneSelect
                value={secondaryStyle}
                onChange={(val) => handleStyleChange(primaryStyle, val)}
                options={["None", ...COMMUNICATION_STYLES.filter((st) => st !== primaryStyle)]}
                isSecondary={true}
              />
            </div>
          </div>

          <div className="p-2 bg-[var(--color-surface-muted)]/60 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)]/60 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>Combined Demeanor:</span>
            <span className="font-bold text-[var(--color-heading)]">
              {agentData.communication_style || "Professional"}
            </span>
          </div>
        </div>

        {/* Card 2: Response Length */}
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <MessageSquareQuote className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                  <span>Response Length &amp; Pacing</span>
                  <InfoTooltip
                    content="Control whether the agent provides concise, balanced, or detailed explanations during spoken responses."
                    position="top"
                  />
                </h3>
              </div>
            </div>
            <Badge variant="success" size="sm" className="text-[10px] font-semibold">
              Voice Recommended: {matchedPurpose.defaultResponseLength || "short"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              {
                id: "short",
                label: "Short",
                icon: Zap,
                badge: "Fast Turns",
                desc: "1–2 sentences. Fast, direct, and ideal for telephony."
              },
              {
                id: "balanced",
                label: "Balanced",
                icon: Clock,
                badge: "Standard",
                desc: "2–3 sentences. Natural flow with complete answers."
              },
              {
                id: "detailed",
                label: "Detailed",
                icon: FileText,
                badge: "In-Depth",
                desc: "3+ sentences. Comprehensive explanations & steps."
              }
            ].map((len) => {
              const isSelected = (agentData.response_length || "short") === len.id;
              const IconComponent = len.icon;

              return (
                <div
                  key={len.id}
                  onClick={() => setAgentData({ ...agentData, response_length: len.id })}
                  className={`p-2.5 rounded-[var(--radius-main,0.375rem)] border flex flex-col justify-between gap-1.5 cursor-pointer transition-all select-none text-left relative ${
                    isSelected
                      ? "bg-[var(--color-primary)]/[0.04] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/40 shadow-2xs"
                      : "bg-[var(--color-surface-muted)] border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))] hover:bg-[var(--color-surface-muted)]/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <IconComponent
                        className={`w-3.5 h-3.5 ${
                          isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
                        }`}
                      />
                      <span className="text-xs font-bold text-[var(--color-heading)]">
                        {len.label}
                      </span>
                    </div>
                    <div
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isSelected
                          ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                          : "border-[var(--color-border-strong,var(--color-border))] bg-[var(--color-surface)]"
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] leading-tight">
                    {len.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 2: Core Personality Traits (Semi-Circle Gauges) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider flex items-center gap-1.5">
              <span>Core Personality Dimensions</span>
              <InfoTooltip
                content="Fine-tune key emotional and behavioral dimensions including professionalism, friendliness, empathy, and confidence."
                position="top"
              />
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <SemiCircleGaugeCard
            label="Professionalism"
            description="Formal, respectful & business-focused"
            icon={Briefcase}
            value={personality.professionalism ?? 85}
            recommendedValue={matchedPurpose.defaultPersonality?.professionalism}
            onChange={(val) => updatePersonality("professionalism", val)}
          />

          <SemiCircleGaugeCard
            label="Friendliness"
            description="Warm, approachable & conversational"
            icon={Smile}
            value={personality.friendliness ?? 90}
            recommendedValue={matchedPurpose.defaultPersonality?.friendliness}
            onChange={(val) => updatePersonality("friendliness", val)}
          />

          <SemiCircleGaugeCard
            label="Empathy"
            description="Active listening & emotional awareness"
            icon={Heart}
            value={personality.empathy ?? 80}
            recommendedValue={matchedPurpose.defaultPersonality?.empathy}
            onChange={(val) => updatePersonality("empathy", val)}
          />

          <SemiCircleGaugeCard
            label="Confidence"
            description="Decisive, authoritative & assured"
            icon={ShieldCheck}
            value={personality.confidence ?? 85}
            recommendedValue={matchedPurpose.defaultPersonality?.confidence}
            onChange={(val) => updatePersonality("confidence", val)}
          />
        </div>
      </div>

      {/* Row 3: Redesigned Interactive 5-Axis AI Personality Studio (Left) + Persona Summary & Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1 items-stretch">
        {/* Left Column: Interactive 5-Axis AI Personality Radar Chart (7 cols) */}
        <div className="lg:col-span-7 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="border-b border-[var(--color-border)] pb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                  <span>Advanced Personality Radar Studio</span>
                  <InfoTooltip
                    content="Drag points along any of the 5 axes to dynamically shape your AI voice agent's tone, energy, patience, curiosity, and assertiveness in real time."
                    position="top"
                  />
                </h4>
              </div>
            </div>

            <Badge variant="primary" size="sm" className="text-[10px]">
              5-Axis Direct Drag
            </Badge>
          </div>

          {/* Central Radar Visualization */}
          <div className="py-2 flex-1 flex items-center justify-center">
            <InteractivePersonalityRadar
              personality={personality}
              onChange={updatePersonality}
            />
          </div>
        </div>

        {/* Right Column: Live Persona Preview Box & Speech Synthesis (5 cols) */}
        <div className="lg:col-span-5 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-3.5 flex flex-col justify-start">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <h4 className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
              <MessageSquareQuote className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Live Persona Preview</span>
              <InfoTooltip
                content="Simulates how your agent introduces itself and interacts with the caller using the active voice and personality parameters."
                position="top"
              />
            </h4>
            <span className="text-[10px] text-[var(--color-muted)] font-medium">
              {selectedVoiceObj.name} ({selectedVoiceObj.gender})
            </span>
          </div>

          {/* Dynamic Personality Summary Sentence */}
          <div className="p-2.5 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/[0.04] border border-[var(--color-primary)]/20 text-xs text-[var(--color-heading)] leading-relaxed">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-primary)] mb-1 uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-[var(--color-primary)]" />
              <span>Active Persona Profile</span>
            </div>
            <p className="text-[11px] text-[var(--color-heading)] font-medium">
              {getDynamicPersonalitySummary()}
            </p>
          </div>

          {/* Dialogue Bubble */}
          <div className="p-3 bg-[var(--color-surface-muted)] rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] space-y-2">
            <div className="flex items-center justify-between gap-1 text-[10px] font-semibold text-[var(--color-muted)]">
              <div className="flex items-center gap-1.5 uppercase tracking-wider">
                <Bot className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>Agent Spoken Preview</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] font-mono text-[9px] text-[var(--color-heading)]">
                  {agentData.communication_style || "Professional"}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] font-mono text-[9px] text-[var(--color-heading)] capitalize">
                  {agentData.response_length || "short"}
                </span>
              </div>
            </div>
            <p className="text-xs text-[var(--color-heading)] font-medium leading-relaxed transition-all duration-200">
              {getDialoguePreview()}
            </p>
          </div>

          {/* Play Sample Voice Button - Positioned directly below the Spoken Preview */}
          <button
            type="button"
            onClick={handlePlaySampleVoice}
            disabled={isLoadingAudio}
            className={`w-full py-2.5 px-3 text-xs font-semibold rounded-[var(--radius-main,0.375rem)] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs ${
              isPlayingAudio
                ? "bg-[var(--color-danger)] text-white hover:opacity-90"
                : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover,var(--color-primary))] disabled:opacity-60"
            }`}
          >
            {isLoadingAudio ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Synthesizing Voice...</span>
              </>
            ) : isPlayingAudio ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Voice Sample</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Sample Voice ({selectedVoiceObj.name})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* SECTION: Golden Conversation Examples (Few-Shot Dialogues) */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <MessageSquareQuote className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider flex items-center gap-1.5">
                <span>Golden Conversation Examples (Few-Shot Dialogues)</span>
                <InfoTooltip
                  content="Inject 2–3 sample phone dialogues to anchor the AI's spoken cadence, empathy, and conciseness for flawless real-world role-play."
                  position="top"
                />
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <Badge variant="primary" size="sm" className="text-[10px] font-mono font-bold">
              {fewShotExamples.length} Active Dialogues
            </Badge>
            <button
              type="button"
              onClick={() => setShowAddExample(!showAddExample)}
              className="px-2.5 py-1 text-xs font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover,var(--color-primary))] rounded-[var(--radius-main,0.375rem)] transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Custom Dialogue</span>
            </button>
          </div>
        </div>

        {/* 1-Click Industry Preset Loaders */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] mr-1">
            Quick-Add Presets:
          </span>
          {[
            { key: "real_estate", label: "Real Estate", icon: Building },
            { key: "healthcare", label: "Healthcare", icon: Heart },
            { key: "b2b_tech", label: "B2B Tech / AI", icon: Laptop },
            { key: "automotive", label: "Automotive Service", icon: Wrench },
            { key: "support", label: "Customer Support", icon: Inbox }
          ].map((preset) => {
            const PresetIcon = preset.icon;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => handleLoadIndustryPreset(preset.key)}
                className="px-2.5 py-1 text-[11px] rounded-[var(--radius-main,0.25rem)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-surface)] text-[var(--color-heading)] font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <PresetIcon className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>

        {/* Add Custom Example Modal / Inline Form */}
        {showAddExample && (
          <div className="p-3.5 bg-[var(--color-surface-muted)]/80 border border-[var(--color-primary)]/40 rounded-[var(--radius-main,0.375rem)] space-y-2.5 animate-fade-in shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Add Golden Dialogue Exchange
              </span>
              <button
                type="button"
                onClick={() => setShowAddExample(false)}
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-heading)] cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-8">
                <input
                  type="text"
                  placeholder="Dialogue Title (e.g. Property Pricing Inquiry)"
                  value={newExampleTitle}
                  onChange={(e) => setNewExampleTitle(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.25rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <div className="sm:col-span-4">
                <select
                  value={newExampleIndustry}
                  onChange={(e) => setNewExampleIndustry(e.target.value)}
                  className="w-full h-8 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.25rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer"
                >
                  <option value="general">General</option>
                  <option value="real_estate">Real Estate</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="b2b_tech">B2B Tech</option>
                  <option value="automotive">Automotive</option>
                  <option value="support">Support</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Caller Turn (Input):</label>
                <input
                  type="text"
                  placeholder="e.g. Hi, how much does the 3 BHK cost?"
                  value={newCallerTurn}
                  onChange={(e) => setNewCallerTurn(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.25rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">AI Assistant Response (Spoken):</label>
                <input
                  type="text"
                  placeholder="e.g. That 3 BHK starts at 1.45 Crore with 2,100 sq ft. Would you like to schedule a site visit this Saturday?"
                  value={newAssistantTurn}
                  onChange={(e) => setNewAssistantTurn(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.25rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] mt-0.5"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleAddFewShotExample}
                disabled={!newExampleTitle.trim() || !newCallerTurn.trim() || !newAssistantTurn.trim()}
                className="px-3 py-1.5 text-xs font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover,var(--color-primary))] rounded-[var(--radius-main,0.25rem)] transition-all cursor-pointer disabled:opacity-50"
              >
                Add Golden Dialogue
              </button>
            </div>
          </div>
        )}

        {/* Dialogues List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
          {fewShotExamples.length === 0 ? (
            <div className="col-span-2 p-6 text-center text-xs text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)]">
              No custom few-shot dialogues configured yet. Click one of the quick presets above to load proven conversation flows.
            </div>
          ) : (
            fewShotExamples.map((ex, idx) => (
              <div
                key={idx}
                className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] space-y-2 hover:border-[var(--color-primary)]/40 transition-colors shadow-2xs"
              >
                <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-[var(--color-border)]/60">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-xs font-bold text-[var(--color-heading)] truncate">{ex.title}</span>
                    <Badge variant="outline" size="sm" className="text-[9px] py-0 px-1 capitalize text-[var(--color-muted)] shrink-0">
                      {ex.industry.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFewShotExample(idx)}
                    className="p-1 text-[var(--color-muted)] hover:text-red-500 transition-colors cursor-pointer shrink-0"
                    title="Remove example"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  {ex.dialogue.map((turn, tIdx) => (
                    <div
                      key={tIdx}
                      className={`p-2 rounded-[var(--radius-main,0.25rem)] text-[11px] leading-relaxed ${
                        turn.role === "user"
                          ? "bg-[var(--color-surface-muted)] text-[var(--color-heading)] font-medium border border-[var(--color-border)]/50"
                          : "bg-[var(--color-primary)]/5 text-[var(--color-heading)] border border-[var(--color-primary)]/15"
                      }`}
                    >
                      <strong className={turn.role === "user" ? "text-[var(--color-muted)]" : "text-[var(--color-primary)]"}>
                        {turn.role === "user" ? "Caller" : "AI"}:
                      </strong>{" "}
                      <span>"{turn.content}"</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
