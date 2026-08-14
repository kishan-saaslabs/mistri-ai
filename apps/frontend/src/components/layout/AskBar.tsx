import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ASK_SUGGESTIONS } from "@/lib/ask";
import { motionTransition, springs } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function AskBar({
  navOpen,
  onOpenNav,
}: {
  navOpen: boolean;
  onOpenNav: () => void;
}) {
  const navigate = useNavigate();
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [modKey, setModKey] = useState("⌘");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelTop, setPanelTop] = useState(72);
  const reduce = useReducedMotion();

  const items = useMemo(() => {
    const q = query.trim();
    const filtered = ASK_SUGGESTIONS.filter((item) =>
      item.toLowerCase().includes(q.toLowerCase()),
    );
    if (q && !ASK_SUGGESTIONS.some((item) => item.toLowerCase() === q.toLowerCase())) {
      return [q, ...filtered];
    }
    return filtered.length ? filtered : ASK_SUGGESTIONS;
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const openCommand = useCallback(() => {
    const bottom = barRef.current?.getBoundingClientRect().bottom ?? 60;
    setPanelTop(bottom + 12);
    setOpen(true);
  }, []);

  const goToAsk = useCallback(
    (text: string) => {
      const prompt = text.trim();
      if (!prompt) return;
      close();
      void navigate("/ask/new", { state: { prompt } });
    },
    [close, navigate],
  );

  useEffect(() => {
    setModKey(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl");
    function onKey(event: KeyboardEvent) {
      if (event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else openCommand();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openCommand, close]);

  useEffect(() => {
    if (!open) return;
    overlayInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, items]);

  function onOverlayKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (items.length === 0) return;
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  const listId = "command-ask-list";
  const activeItem = items[activeIndex];

  return (
    <div
      ref={barRef}
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
      <div className="relative min-w-0 flex-1 md:w-1/2 md:flex-none">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          id="topask"
          placeholder="Ask anything…"
          className="h-9 rounded-[7px] bg-background pr-16 pl-9 text-[13px] shadow-none"
          onFocus={openCommand}
          readOnly
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
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
                  key="command-backdrop"
                  type="button"
                  aria-label="Close search"
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
                  key="command-panel"
                  role="dialog"
                  aria-label="Ask anything"
                  aria-modal="true"
                  className="fixed left-1/2 z-50 w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-lg ring-1 ring-foreground/10"
                  style={{ top: panelTop }}
                  initial={
                    reduce
                      ? { opacity: 0, x: "-50%" }
                      : { opacity: 0, scale: 0.96, x: "-50%", y: -8 }
                  }
                  animate={{ opacity: 1, scale: 1, x: "-50%", y: 0 }}
                  exit={
                    reduce
                      ? { opacity: 0, x: "-50%" }
                      : { opacity: 0, scale: 0.96, x: "-50%", y: -8 }
                  }
                  transition={motionTransition(reduce, springs.dialog)}
                >
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (activeItem) goToAsk(activeItem);
                    }}
                    className="relative border-b border-border"
                  >
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      ref={overlayInputRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={onOverlayKeyDown}
                      placeholder="Ask anything…"
                      role="combobox"
                      aria-expanded
                      aria-controls={listId}
                      aria-activedescendant={
                        activeItem ? `command-ask-${activeIndex}` : undefined
                      }
                      aria-autocomplete="list"
                      className="h-12 w-full bg-transparent pr-4 pl-11 text-[15px] outline-none placeholder:text-muted-foreground"
                    />
                  </form>
                  <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
                    Suggested
                  </div>
                  <div
                    id={listId}
                    role="listbox"
                    aria-label="Suggested questions"
                    className="max-h-[min(420px,50vh)] overflow-y-auto p-1.5 pt-0"
                  >
                    {items.map((item, index) => {
                      const selected = index === activeIndex;
                      const custom = Boolean(query.trim()) && index === 0 && item === query.trim();
                      return (
                        <button
                          key={item}
                          id={`command-ask-${index}`}
                          ref={(node) => {
                            itemRefs.current[index] = node;
                          }}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
                            selected
                              ? "bg-muted text-foreground"
                              : "text-ink-soft hover:bg-muted/60 hover:text-foreground",
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => goToAsk(item)}
                        >
                          <Sparkles className="size-3.5 shrink-0 opacity-85" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                              {item}
                            </span>
                            <span className="block text-[10.5px] text-muted-foreground">
                              {custom ? "Open in Ask Mistri" : "Suggested question"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
