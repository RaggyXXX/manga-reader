import type { Transition, Variants } from "framer-motion";

export const motionDurations = {
  fast: 0.16,
  base: 0.24,
  slow: 0.34,
} as const;

export const motionTransition: Transition = {
  duration: motionDurations.base,
  ease: [0.2, 0.8, 0.2, 1],
};

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: motionTransition },
};

export function motionOrInstant(reduced: boolean, duration = motionDurations.base): Transition {
  if (reduced) {
    return { duration: 0 };
  }
  return { duration, ease: [0.2, 0.8, 0.2, 1] };
}
