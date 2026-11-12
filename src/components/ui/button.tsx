"use client";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";
import { useSyncExternalStore, type ComponentProps } from "react";
const subscribe = () => () => {};
const variants = cva("button", {
  variants: {
    variant: {
      default: "button-primary",
      outline: "button-outline",
      ghost: "button-ghost",
      destructive: "button-danger",
    },
  },
  defaultVariants: { variant: "default" },
});
export function Button({
  className,
  variant,
  asChild = false,
  disabled,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      disabled={asChild ? disabled : disabled || !hydrated}
      className={twMerge(clsx(variants({ variant }), className))}
      {...props}
    />
  );
}
