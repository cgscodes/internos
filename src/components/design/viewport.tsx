"use client";
import { useEffect } from "react";
export function ViewportObserver() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const root = document.documentElement;
      root.style.setProperty("--visual-height", `${viewport.height}px`);
      root.style.setProperty("--visual-offset", `${viewport.offsetTop}px`);
      const editing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;
      root.dataset.keyboardOpen =
        editing && window.innerHeight - viewport.height > 160
          ? "true"
          : "false";
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return null;
}
