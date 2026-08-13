import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddTeamMemberDialog } from "@/components/team/AddTeamMemberDialog";
import { usersApi, type AuthUser } from "@/lib/api";
import { formatDate, initialsOf, roleLabel } from "@/lib/display";
import { useAsyncData } from "@/lib/useAsyncData";
import { useAuth } from "@/state/auth";
import { cn } from "@/lib/utils";

export function TeamView() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useAsyncData<AuthUser[]>(
    () => usersApi.list(),
    [],
  );
  const [addOpen, setAddOpen] = useState(false);

  const canManage = user?.role === "OWNER" || user?.role === "ADMIN";
  const members = data ?? [];

  return (
    <div className="mx-auto w-full max-w-[760px] overflow-y-auto px-7 pt-10 pb-[60px]">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Team</h1>
        {canManage && (
          <Button
            type="button"
            size="sm"
            data-icon="inline-start"
            onClick={() => setAddOpen(true)}
          >
            <UserPlus className="size-3.5" />
            Add team member
          </Button>
        )}
      </div>
      <p className="mb-[18px] text-[12.5px] text-muted-foreground">
        Everyone in your organization.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="py-16 text-center">
          <p className="mb-3 text-[13px] text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={refetch}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {members.map((member, i) => (
            <div
              key={member.id}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5",
                i !== members.length - 1 && "border-b border-border",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-border bg-muted font-mono text-[10.5px] text-ink-soft">
                {initialsOf(member.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">
                  {member.name}
                  {member.id === user?.id && (
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                      (you)
                    </span>
                  )}
                </div>
                <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                  {member.email} · joined {formatDate(member.createdAt)}
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-ink-soft">
                {roleLabel(member.role)}
              </span>
            </div>
          ))}
        </div>
      )}

      <AddTeamMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        allowOwner={user?.role === "OWNER"}
        onCreated={refetch}
      />
    </div>
  );
}
