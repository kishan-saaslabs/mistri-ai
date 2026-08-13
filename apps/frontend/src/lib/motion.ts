import type { Transition } from "motion/react";

export const springs = {
  snappy: { type: "spring", stiffness: 500, damping: 30 },
  smooth: { type: "spring", stiffness: 300, damping: 25 },
  gentle: { type: "spring", stiffness: 200, damping: 22 },
  bouncy: { type: "spring", stiffness: 400, damping: 18 },
  press: { type: "spring", stiffness: 600, damping: 35 },
  dialog: { type: "spring", stiffness: 340, damping: 22, mass: 0.9 },
  overlay: { type: "spring", stiffness: 200, damping: 26 },
  pill: { type: "spring", stiffness: 520, damping: 38, mass: 0.8 },
  highlight: { type: "spring", stiffness: 260, damping: 28 },
  gauge: { type: "spring", stiffness: 180, damping: 22 },
} as const satisfies Record<string, Transition>;

export function motionTransition(
  reduce: boolean | null,
  spring: Transition,
): Transition {
  return reduce ? { duration: 0 } : spring;
}
