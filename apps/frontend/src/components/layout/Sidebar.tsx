import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Diamond, Loader2, LogOut, MessageCircleQuestion, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
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
  const { pathname } = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      void navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
      setConfirmOpen(false);
    }
  }

  const roleLabel = user?.role
    ? user.role.charAt(0) + user.role.slice(1).toLowerCase().replace("_", " ")
    : "";

  return (
    <aside className="hidden h-full w-[232px] shrink-0 flex-col border-r border-border bg-sidebar px-3 py-4 text-ink-soft md:flex">
      <div className="mb-5 flex items-center gap-2.5 px-2 pt-1">
        <div className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-foreground text-[12.5px] font-bold text-background">
          M
        </div>
        <div className="text-[14.5px] font-semibold tracking-tight text-foreground">Mistri AI</div>
      </div>

      <nav className="mb-4 space-y-px">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => {
              const active =
                item.to === "/deals"
                  ? pathname === "/deals" ||
                    pathname.startsWith("/deals/") ||
                    pathname.startsWith("/calls/")
                  : isActive;
              return cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink-soft",
                active && "bg-muted font-semibold text-foreground",
                !active && "hover:bg-muted hover:text-foreground",
              );
            }}
          >
            <item.icon className="size-3.5 opacity-85" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-1 border-t border-border px-2.5 pt-2.5">
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
        <ThemeToggle />
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label="Sign out"
          title="Sign out"
          className="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!signingOut) setConfirmOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>
              You'll need to sign in again to access this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={signingOut}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleLogout()}
              disabled={signingOut}
            >
              {signingOut ? <Loader2 className="size-4 animate-spin" /> : null}
              Sign out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
