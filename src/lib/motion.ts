import type { Transition, Variants } from "framer-motion";

export const motionDurations = {
  fast: 0.14,
  base: 0.22,
  slow: 0.32,
} as const;

export const cozyEase = [0.22, 0.8, 0.2, 1] as const;

export const motionTransition: Transition = {
  duration: motionDurations.base,
  ease: cozyEase,
};

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: motionTransition },
};

export function motionOrInstant(reduced: boolean, duration: number = motionDurations.base): Transition {
  if (reduced) {
    return { duration: 0 };
  }
  return { duration, ease: cozyEase };
}
