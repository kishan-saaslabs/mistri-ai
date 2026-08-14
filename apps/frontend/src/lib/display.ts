import type { Role } from "@/lib/api";

export function roleLabel(role: Role) {
  if (role === "TEAM_MEMBER") return "Team member";
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
