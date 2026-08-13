import { useEffect, useRef, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/state/workspace";

export function AskBar() {
  const { askQuestion } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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
    <form onSubmit={onSubmit} className="flex shrink-0 items-center gap-2.5 border-b border-border bg-background px-[26px] py-3">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          id="topask"
          placeholder="Ask Mistri anything about your calls or reps…"
          className="h-9 rounded-[7px] bg-background pr-3 pl-9 text-[13px] shadow-none"
        />
      </div>
      <span className="hidden shrink-0 rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground sm:inline">
        ⌘K
      </span>
    </form>
  );
}
