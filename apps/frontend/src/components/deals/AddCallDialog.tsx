import { useEffect, useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, callsApi, type Call } from "@/lib/api";
import { motionTransition, springs } from "@/lib/motion";
import { cn } from "@/lib/utils";

const ACCEPT = ".mp3,.mp4,.wav,.m4a,audio/*,video/mp4";

export function AddCallDialog({
  open,
  onOpenChange,
  dealId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  onAdded: (call: Call) => void;
}) {
  const [mode, setMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (open) {
      setMode("file");
      setFile(null);
      setUrl("");
      setLabel("");
      setDragOver(false);
      setSubmitting(false);
    }
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    if (mode === "file") {
      if (!file) {
        toast.error("Choose an MP3/MP4 file first, or switch to a link.");
        return;
      }
    } else if (!url.trim()) {
      toast.error("Paste a recording link first.");
      return;
    }

    setSubmitting(true);
    try {
      const call =
        mode === "file"
          ? await callsApi.uploadToDeal(dealId, file!)
          : await callsApi.linkToDeal({
              url: url.trim(),
              dealId,
              ...(label.trim() ? { label: label.trim() } : {}),
            });
      toast.success(`“${call.label}” added to this deal.`);
      onAdded(call);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not add the call.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add a call</DialogTitle>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as "file" | "link")}
        >
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="file">Upload file</TabsTrigger>
            <TabsTrigger value="link">Paste a link</TabsTrigger>
          </TabsList>

          <form onSubmit={submit}>
            <TabsContent value="file">
              <motion.label
                className={cn(
                  "mb-4 block cursor-pointer rounded-[9px] border-[1.5px] border-dashed border-border px-4 py-[26px] text-center",
                  dragOver && "border-brand bg-brand-tint",
                )}
                initial={false}
                animate={{ scale: dragOver ? 1.015 : 1 }}
                transition={motionTransition(reduce, springs.snappy)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  const next = event.dataTransfer.files[0];
                  if (next) setFile(next);
                }}
              >
                <div className="mx-auto mb-2.5 flex size-[30px] items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <ArrowUp className="size-3.5" />
                </div>
                <div className="text-[12.5px] text-muted-foreground">
                  Drop an MP3, WAV, M4A, or MP4 here, or{" "}
                  <span className="text-brand underline">browse</span>
                </div>
                {file ? (
                  <div className="mt-2.5 font-mono text-[11.5px] text-ink-soft">
                    {file.name}
                  </div>
                ) : null}
                <input
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const next = event.target.files?.[0];
                    if (next) setFile(next);
                  }}
                />
              </motion.label>
            </TabsContent>
            <TabsContent value="link">
              <div className="mb-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="call-url">Recording URL</Label>
                  <Input
                    id="call-url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://…/recording.mp3"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="call-label">
                    Label{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="call-label"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Acme Corp — Discovery"
                  />
                </div>
              </div>
            </TabsContent>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" pending={submitting}>
                Add call
              </Button>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
