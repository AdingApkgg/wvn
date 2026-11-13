import type { Transition } from "motion/react";

// AndroidX ExpressiveMotionTokens v0_14_0，质量为 1。
// https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt
function spring(stiffness: number, ratio: number): Transition {
  return { type: "spring", stiffness, damping: 2 * ratio * Math.sqrt(stiffness), mass: 1 };
}

export const m3Motion = {
  spatial: { fast: spring(800, 0.6), default: spring(380, 0.8), slow: spring(200, 0.8) },
  effects: { fast: spring(3800, 1), default: spring(1600, 1), slow: spring(800, 1) },
} as const;
