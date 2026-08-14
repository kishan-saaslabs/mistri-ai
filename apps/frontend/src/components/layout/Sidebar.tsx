import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Handshake, LogOut, Sparkles, Users, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { motionTransition, springs } from "@/lib/motion";
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
  { to: "/deals", label: "Deals", icon: Handshake },
  { to: "/team", label: "Team", icon: Users },
  { to: "/ask", label: "Ask Mistri", icon: Sparkles },
];

function SidebarBody({
  onNavigate,
  onClose,
  pillId,
}: {
  onNavigate?: () => void;
  onClose?: () => void;
  pillId: string;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const reduce = useReducedMotion();

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
    <>
      <div className="mb-5 flex items-center gap-2.5 px-2 pt-1">
        <div className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-foreground text-[12.5px] font-bold text-background">
          M
        </div>
        <div className="min-w-0 flex-1 text-[14.5px] font-semibold tracking-tight text-foreground">
          Mistri AI
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <nav className="mb-4 space-y-px">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) => {
              const active =
                item.to === "/deals"
                  ? pathname === "/deals" ||
                    pathname.startsWith("/deals/") ||
                    pathname.startsWith("/calls/")
                  : isActive;
              return cn(
                "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink-soft",
                active && "font-semibold text-foreground",
                !active && "hover:text-foreground",
              );
            }}
          >
            {({ isActive }) => {
              const active =
                item.to === "/deals"
                  ? pathname === "/deals" ||
                    pathname.startsWith("/deals/") ||
                    pathname.startsWith("/calls/")
                  : isActive;
              return (
                <>
                  {active ? (
                    <motion.span
                      layoutId={pillId}
                      className="absolute inset-0 rounded-md bg-muted"
                      transition={motionTransition(reduce, springs.pill)}
                    />
                  ) : null}
                  <item.icon className="relative z-1 size-3.5 opacity-85" />
                  <span className="relative z-1">{item.label}</span>
                </>
              );
            }}
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
              pending={signingOut}
            >
              Sign out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const panelClass =
  "flex h-full w-[232px] shrink-0 flex-col border-r border-border bg-sidebar px-3 py-4 text-ink-soft";

export function Sidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();

  useEffect(() => {
    onOpenChange(false);
  }, [pathname, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <>
      <aside className={cn("hidden md:flex", panelClass)}>
        <SidebarBody pillId="sidebar-nav-desktop" />
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          !open && "pointer-events-none",
        )}
      >
        <motion.button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label="Close menu"
          className="absolute inset-0 bg-black/40"
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={motionTransition(reduce, springs.overlay)}
          onClick={() => onOpenChange(false)}
        />
        <motion.aside
          id="mobile-sidebar"
          className={cn(panelClass, "relative max-w-[85vw]")}
          initial={false}
          animate={{ x: open ? 0 : "-100%" }}
          transition={motionTransition(reduce, springs.smooth)}
        >
          <SidebarBody
            pillId="sidebar-nav-mobile"
            onNavigate={() => onOpenChange(false)}
            onClose={() => onOpenChange(false)}
          />
        </motion.aside>
      </div>
    </>
  );
}
