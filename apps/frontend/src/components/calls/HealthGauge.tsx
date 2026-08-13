import { cn } from "@/lib/utils";
import { statusHex } from "@/lib/format";

type Props = {
  score: number | null;
  color: string;
  size?: number;
  stroke?: number;
};

export function HealthGauge({ score, color, size = 60, stroke = 5 }: Props) {
  const r = (size - stroke) / 2 - 2;
  const circ = 2 * Math.PI * r;
  const hasScore = typeof score === "number";
  const offset = hasScore ? circ * (1 - score / 100) : circ;
  const hex = statusHex[color] ?? statusHex.neutral;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDEEEB" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeDasharray={circ.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
        />
      </svg>
      <span className={cn("relative z-10 font-mono font-semibold", size > 50 ? "text-base" : "text-xs")}>
        {hasScore ? score : "--"}
      </span>
    </div>
  );
}
