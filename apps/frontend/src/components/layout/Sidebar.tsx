import { NavLink, useLocation } from "react-router-dom";
import { Diamond, MessageCircleQuestion, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/state/workspace";

const nav = [
  { to: "/calls", label: "Calls", icon: Square },
  { to: "/deals", label: "Deals", icon: Diamond },
  { to: "/ask", label: "Ask Mistri", icon: MessageCircleQuestion },
];

export function Sidebar() {
  const { reps, setListFilter, listFilter } = useWorkspace();
  const location = useLocation();

  return (
    <aside className="hidden h-full w-[232px] shrink-0 flex-col border-r border-[#eaeaea] bg-sidebar px-3 py-4 text-ink-soft md:flex">
      <div className="mb-5 flex items-center gap-2.5 px-2 pt-1">
        <div className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-foreground text-[12.5px] font-bold text-white">
          M
        </div>
        <div className="text-[14.5px] font-semibold tracking-tight text-foreground">Mistri AI</div>
      </div>

      <nav className="mb-4 space-y-px">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink-soft",
                isActive && "bg-[#f0f0f0] font-semibold text-foreground",
                !isActive && "hover:bg-muted hover:text-foreground",
              )
            }
          >
            <item.icon className="size-3.5 opacity-85" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mb-4">
        <div className="mb-1.5 px-2.5 font-mono text-[9.5px] tracking-[0.12em] text-muted-foreground uppercase">
          Team
        </div>
        {Object.values(reps).map((rep) => (
          <button
            key={rep.slug}
            type="button"
            onClick={() => setListFilter({ type: "rep", key: rep.slug })}
            className={cn(
              "mb-px flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left",
              location.pathname === "/calls" && listFilter?.type === "rep" && listFilter.key === rep.slug
                ? "bg-[#f0f0f0]"
                : "hover:bg-muted",
            )}
          >
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[5px] border border-border bg-muted font-mono text-[9.5px] text-ink-soft">
              {rep.initials}
            </span>
            <span className="flex-1 text-[12.5px] text-ink-soft">{rep.name.split(" ")[0]}</span>
            <span className="font-mono text-[10.5px] text-muted-foreground">{rep.avgHealth ?? "--"}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto border-t border-[#eaeaea] px-2.5 pt-2.5">
        <div className="flex items-center gap-2.5 text-[12.5px] text-ink-soft">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-border bg-muted font-mono text-[10px]">
            AK
          </div>
          <div>
            Alex Kim
            <div className="font-mono text-[10px] text-muted-foreground">Northbeam · Sales Ops</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
