import { useEffect, useRef, useState, type FormEvent } from "react";
import { Menu, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/state/workspace";

export function AskBar({
  navOpen,
  onOpenNav,
}: {
  navOpen: boolean;
  onOpenNav: () => void;
}) {
  const { askQuestion } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [modKey, setModKey] = useState("⌘");

  useEffect(() => {
    setModKey(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl");
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = inputRef.current?.value ?? "";
    askQuestion(value, { clearContext: true });
    if (inputRef.current) inputRef.current.value = "";
  }

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
      <div className="relative min-w-0 flex-1 md:w-1/2 md:flex-none">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          id="topask"
          placeholder="Ask Mistri anything about your calls or reps…"
          className="h-9 rounded-[7px] bg-background pr-16 pl-9 text-[13px] shadow-none"
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
    </form>
  );
}
