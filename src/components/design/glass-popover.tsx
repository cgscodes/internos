"use client";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { X } from "lucide-react";
export function GlassPopover({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="glass-surface glass-elevated glass-popover"
          sideOffset={8}
          align="end"
          collisionPadding={16}
          aria-label={label}
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("a[href]")
            )
              setOpen(false);
          }}
        >
          <div className="popover-heading">
            <h2>{label}</h2>
            <Popover.Close
              className="icon-button"
              aria-label={`Close ${label.toLowerCase()}`}
            >
              <X size={16} />
            </Popover.Close>
          </div>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
