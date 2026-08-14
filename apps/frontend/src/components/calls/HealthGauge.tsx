import { useEffect } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";
import { cn } from "@/lib/utils";
import { statusHex } from "@/lib/format";
import { springs } from "@/lib/motion";

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
  const target = hasScore ? circ * (1 - score / 100) : circ;
  const hex = statusHex[color] ?? statusHex.neutral;
  const reduce = useReducedMotion();
  const offset = useSpring(reduce ? target : circ, springs.gauge);

  useEffect(() => {
    offset.set(target);
  }, [offset, target]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="absolute inset-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="size-full">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDEEEB" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={hex}
            strokeWidth={stroke}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeDasharray={circ.toFixed(1)}
            style={{ strokeDashoffset: offset }}
          />
        </svg>
      </div>
      <span className={cn("relative z-10 font-mono font-semibold", size > 50 ? "text-base" : "text-xs")}>
        {hasScore ? score : "--"}
      </span>
    </div>
  );
}
