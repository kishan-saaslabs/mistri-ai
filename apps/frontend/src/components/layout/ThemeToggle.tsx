import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { applyThemeTransition, originFromElement } from "@/lib/themeTransition";
import { cn } from "@/lib/utils";

/**
 * Light/dark toggle. Selection is persisted to localStorage by next-themes
 * (storageKey "mistri-theme") and re-applied on load.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid a hydration/first-paint mismatch: only reflect the resolved theme
  // once mounted on the client.
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title="Toggle theme"
      onClick={(event) =>
        applyThemeTransition(
          isDark ? "light" : "dark",
          setTheme,
          originFromElement(event.currentTarget),
        )
      }
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {mounted ? (
        isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />
      ) : (
        <span className="size-3.5" />
      )}
    </button>
  );
}
