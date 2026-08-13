import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ASK_SUGGESTIONS } from "@/lib/ask";
import { motionTransition, springs } from "@/lib/motion";
import { useWorkspace } from "@/state/workspace";

export function AskBar({
  navOpen,
  onOpenNav,
}: {
  navOpen: boolean;
  onOpenNav: () => void;
}) {
  const { askQuestion } = useWorkspace();
  const { pathname } = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [modKey, setModKey] = useState("⌘");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState({ top: 72, left: 24, width: 480 });
  const reduce = useReducedMotion();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const openCommand = useCallback(() => {
    if (pathname === "/ask") {
      document.getElementById("ask-composer")?.focus();
      return;
    }
    const rect = fieldRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(Math.max(rect.width, 360), window.innerWidth - 24);
      setOrigin({
        top: rect.top,
        left: Math.min(rect.left, window.innerWidth - 16 - width),
        width,
      });
    }
    setOpen(true);
  }, [pathname]);

  function submitQuery(text: string) {
    const value = text.trim();
    if (!value) return;
    askQuestion(value, { clearContext: true });
    close();
    if (inputRef.current) inputRef.current.value = "";
  }

  useEffect(() => {
    setModKey(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl");
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else openCommand();
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openCommand, close]);

  useEffect(() => {
    if (!open) return;
    overlayInputRef.current?.focus();
  }, [open]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitQuery(inputRef.current?.value ?? "");
  }

  const filtered = ASK_SUGGESTIONS.filter((item) =>
    item.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <form
      onSubmit={onSubmit}
      className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-3 md:px-[26px]"
    >
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open menu"
        aria-expanded={navOpen}
        aria-controls="mobile-sidebar"
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
      >
        <Menu className="size-4" />
      </button>
      <div
        ref={fieldRef}
        className="relative min-w-0 flex-1 md:w-1/2 md:flex-none"
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          id="topask"
          placeholder="Ask about a deal…"
          className="h-9 rounded-[7px] bg-background pr-16 pl-9 text-[13px] shadow-none"
          onFocus={openCommand}
          readOnly
        />
        <span className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 items-center gap-0.5 sm:flex">
          <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-border px-1 font-sans text-[10px] leading-none text-muted-foreground">
            {modKey}
          </kbd>
          <kbd className="inline-flex size-[18px] items-center justify-center rounded-[4px] border border-border font-sans text-[10px] leading-none text-muted-foreground">
            K
          </kbd>
        </span>
      </div>

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.button
                  key="ask-backdrop"
                  type="button"
                  aria-label="Close ask"
                  className="fixed inset-0 z-50 bg-black/20 supports-backdrop-filter:backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={motionTransition(reduce, springs.overlay)}
                  onClick={close}
                />
              ) : null}
              {open ? (
                <motion.div
                  key="ask-panel"
                  role="dialog"
                  aria-label="Ask Mistri"
                  className="fixed z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-lg ring-1 ring-foreground/10"
                  style={{
                    top: origin.top,
                    left: origin.left,
                    width: origin.width,
                    transformOrigin: "top center",
                  }}
                  initial={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.96, y: -8 }
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.96, y: -8 }
                  }
                  transition={motionTransition(reduce, springs.smooth)}
                >
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitQuery(query);
                    }}
                    className="relative border-b border-border"
                  >
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      ref={overlayInputRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Ask about a deal…"
                      className="h-11 w-full bg-transparent pr-4 pl-9 text-[13.5px] outline-none"
                    />
                  </form>
                  <div className="p-1.5">
                    {(filtered.length ? filtered : ASK_SUGGESTIONS).map(
                      (item) => (
                        <motion.button
                          key={item}
                          type="button"
                          className="w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-soft hover:bg-muted hover:text-foreground"
                          whileTap={reduce ? undefined : { scale: 0.98 }}
                          transition={motionTransition(reduce, springs.snappy)}
                          onClick={() => submitQuery(item)}
                        >
                          {item}
                        </motion.button>
                      ),
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </form>
  );
}
