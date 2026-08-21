import React from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Transition, Variant, MotionProps } from "motion/react";
import { cn } from "@/lib/utils";

export type TransitionPanelVariants = {
  enter?: ((custom?: any) => Variant) | Variant;
  center?: Variant;
  exit?: ((custom?: any) => Variant) | Variant;
};

export type TransitionPanelProps = {
  children: React.ReactNode;
  className?: string;
  transition?: Transition;
  activeIndex: number;
  variants?: TransitionPanelVariants;
  custom?: any;
} & MotionProps &
  React.ComponentPropsWithoutRef<"div">;

export function TransitionPanel({
  children,
  className,
  transition,
  variants,
  activeIndex,
  custom,
  ...rest
}: TransitionPanelProps) {
  const childrenArray = React.Children.toArray(children);
  const currentChild =
    childrenArray.length > 1 ? childrenArray[activeIndex] : children;

  return (
    <div className={cn("relative", className)} {...rest}>
      <AnimatePresence initial={false} mode="popLayout" custom={custom}>
        <motion.div
          key={activeIndex}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
          custom={custom}
        >
          {currentChild}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
