import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
export function GlassSurface({
  as: Tag = "div",
  elevated = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "aside" | "header" | "nav" | "section";
  elevated?: boolean;
}) {
  return (
    <Tag
      {...props}
      className={cn("glass-surface", elevated && "glass-elevated", className)}
    />
  );
}
export function GlassNavigation(props: HTMLAttributes<HTMLElement>) {
  return (
    <GlassSurface
      as="aside"
      {...props}
      className={cn("sidebar", props.className)}
    />
  );
}
export function GlassToolbar(props: HTMLAttributes<HTMLElement>) {
  return (
    <GlassSurface
      as="header"
      {...props}
      className={cn("utility-bar", props.className)}
    />
  );
}
export function GlassTabBar(props: HTMLAttributes<HTMLElement>) {
  return (
    <GlassSurface
      as="nav"
      elevated
      {...props}
      className={cn("bottom-nav", props.className)}
    />
  );
}
export function GlassButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      variant={props.variant || "outline"}
      className={cn("glass-button", props.className)}
    />
  );
}
