import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, usersApi, type AuthUser, type Role } from "@/lib/api";

const MIN_PASSWORD = 8;

export function AddTeamMemberDialog({
  open,
  onOpenChange,
  onCreated,
  allowOwner = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: AuthUser) => void;
  allowOwner?: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("TEAM_MEMBER");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPassword("");
      setRole("TEAM_MEMBER");
      setSubmitting(false);
    }
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (password.length < MIN_PASSWORD) {
      toast.error(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setSubmitting(true);
    try {
      const user = await usersApi.create({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      toast.success(`${user.name} added to your organization.`);
      onCreated(user);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not add the teammate.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 mb-1 text-[12.5px] text-muted-foreground">
          Creates a login in your organization. Share the temporary password so
          they can sign in.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Full name</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger
                  id="team-role"
                  className="h-8 w-full font-sans text-[12.5px] font-normal normal-case tracking-normal"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEAM_MEMBER">Team member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  {allowOwner && <SelectItem value="OWNER">Owner</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-email">Email</Label>
            <Input
              id="team-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-password">Temporary password</Label>
            <Input
              id="team-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Add member
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
