import { NavLink, useNavigate } from "react-router-dom";
import { Diamond, LogOut, MessageCircleQuestion, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const nav = [
  { to: "/deals", label: "Deals", icon: Diamond },
  { to: "/team", label: "Team", icon: Users },
  { to: "/ask", label: "Ask Mistri", icon: MessageCircleQuestion },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    void navigate("/login", { replace: true });
  }

  const roleLabel = user?.role
    ? user.role.charAt(0) + user.role.slice(1).toLowerCase().replace("_", " ")
    : "";

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

      <div className="mt-auto flex items-center gap-2 border-t border-[#eaeaea] px-2.5 pt-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 text-[12.5px] text-ink-soft">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-border bg-muted font-mono text-[10px]">
            {user ? initialsOf(user.name) : "?"}
          </div>
          <div className="min-w-0">
            <div className="truncate">{user?.name ?? "—"}</div>
            <div className="truncate font-mono text-[10px] text-muted-foreground">
              {[user?.org, roleLabel].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          aria-label="Sign out"
          title="Sign out"
          className="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}
