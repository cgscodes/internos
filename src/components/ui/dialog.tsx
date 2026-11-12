"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) return;
    const rememberOpener = (event: MouseEvent) => {
      if (event.target instanceof Element) {
        const control = event.target.closest<HTMLElement>(
          "button,a[href],input,select,textarea,[tabindex]",
        );
        if (control) {
          returnFocus.current = control;
          // Safari focuses a tabbable ancestor on pointer press. Normalize at click,
          // after that default action and before a keyed dialog can mount.
          if (control.matches("button,a[href]"))
            control.focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener("click", rememberOpener, true);
    return () => document.removeEventListener("click", rememberOpener, true);
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content glass-dialog"
          onOpenAutoFocus={() => {
            // Safari does not focus buttons on pointer activation. Keep the captured
            // opener in that case; keyboard activation uses the focused control.
            const active = document.activeElement;
            if (active instanceof HTMLElement && active !== document.body)
              returnFocus.current = active;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
        >
          <div className="dialog-heading glass-surface glass-elevated">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Manage the details in your workspace."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Modal as GlassDialog };
