"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { Monitor, Sun, Moon, Check, SlidersHorizontal } from "lucide-react";
import { appearanceStorage } from "@/lib/appearance";
import { Button } from "@/components/ui/button";
import { GlassPopover } from "./glass-popover";
type Theme = "light" | "dark" | "system";
type Preferences = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  reduceTransparency: boolean;
  setReduceTransparency: (value: boolean) => void;
};
const Context = createContext<Preferences | null>(null);
const themeKey = appearanceStorage.theme,
  transparencyKey = appearanceStorage.transparency;
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("internos-appearance", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("internos-appearance", listener);
  };
}
function readTheme(): Theme {
  try {
    const value = localStorage.getItem(themeKey);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
function readTransparency() {
  try {
    return localStorage.getItem(transparencyKey) === "true";
  } catch {
    return false;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences can fall back to the system when storage is unavailable. */
  }
  window.dispatchEvent(new Event("internos-appearance"));
}

export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useSyncExternalStore(
    subscribe,
    readTheme,
    () => "system" as const,
  );
  const reduceTransparency = useSyncExternalStore(
    subscribe,
    readTransparency,
    () => false,
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.transparency = reduceTransparency
      ? "reduced"
      : "full";
  }, [theme, reduceTransparency]);
  return (
    <Context.Provider
      value={{
        theme,
        setTheme: (value) => write(themeKey, value),
        reduceTransparency,
        setReduceTransparency: (value) => write(transparencyKey, String(value)),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAppearance() {
  const context = useContext(Context);
  if (!context) throw new Error("Appearance provider is required");
  return context;
}
export function AppearanceControls() {
  const { theme, setTheme, reduceTransparency, setReduceTransparency } =
    useAppearance();
  return (
    <div className="appearance-controls">
      <div
        className="segmented-control appearance-options"
        aria-label="Color theme"
      >
        {(
          [
            { value: "light", icon: Sun, label: "Light" },
            { value: "dark", icon: Moon, label: "Dark" },
            { value: "system", icon: Monitor, label: "System" },
          ] as const
        ).map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            type="button"
            aria-label={`${label} theme`}
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
          >
            <Icon size={16} />
            <span>{label}</span>
            {theme === value && <Check size={12} className="theme-check" />}
          </button>
        ))}
      </div>
      <label className="switch-row">
        <span>
          <strong>Reduce transparency</strong>
          <small>Use opaque surfaces for extra clarity.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={reduceTransparency}
          onChange={(event) => setReduceTransparency(event.target.checked)}
        />
      </label>
    </div>
  );
}
export function AppearanceMenu() {
  return (
    <GlassPopover
      label="Appearance"
      trigger={
        <Button
          variant="ghost"
          className="icon-button toolbar-control"
          aria-label="Appearance"
        >
          <SlidersHorizontal size={18} />
        </Button>
      }
    >
      <AppearanceControls />
    </GlassPopover>
  );
}
