import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/state/workspace";

const ACCEPT = ".mp3,.mp4,.wav,.m4a,audio/*,video/mp4";

export function UploadCallDialog() {
  const { uploadOpen, setUploadOpen, reps, deals, listFilter, queueUpload } = useWorkspace();
  const [mode, setMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [rep, setRep] = useState("sarah");
  const [dealId, setDealId] = useState("unassigned");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!uploadOpen) return;
    setFile(null);
    setLink("");
    setMode("file");
    setRep(Object.keys(reps)[0] ?? "sarah");
    setDealId(listFilter?.type === "deal" ? listFilter.id : "unassigned");
  }, [uploadOpen, listFilter, reps]);

  function submit() {
    if (mode === "file") {
      if (!file) {
        toast.error("Choose an MP3/MP4 file first, or switch to Paste a link.");
        return;
      }
      const filename = file.name;
      const label = filename.replace(/\.[^/.]+$/, "");
      queueUpload({ label, filename, rep, dealId: dealId === "unassigned" ? null : dealId });
    } else {
      const url = link.trim();
      if (!url) {
        toast.error("Paste a call recording link first.");
        return;
      }
      let label = "Linked call";
      try {
        label = `Linked call — ${new URL(url).hostname.replace(/^www\./, "")}`;
      } catch {
        toast.error("Enter a valid URL.");
        return;
      }
      queueUpload({ label, filename: url, rep, dealId: dealId === "unassigned" ? null : dealId });
    }
    setUploadOpen(false);
  }

  return (
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Add a call</DialogTitle>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(value) => setMode(value as "file" | "link")}>
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="file">Upload file</TabsTrigger>
            <TabsTrigger value="link">Paste a link</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "file" ? (
          <label
            className={cn(
              "mb-4 block cursor-pointer rounded-[9px] border-[1.5px] border-dashed border-border px-4 py-[26px] text-center",
              dragOver && "border-brand bg-brand-tint",
            )}
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
              Drop an MP3 or MP4 here, or <span className="text-brand underline">browse</span>
            </div>
            {file ? <div className="mt-2.5 font-mono text-[11.5px] text-ink-soft">{file.name}</div> : null}
            <input
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                const next = event.target.files?.[0];
                if (next) setFile(next);
              }}
            />
          </label>
        ) : (
          <Input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Paste a Zoom, Meet, or call recording link…"
            className="mb-4"
          />
        )}

        <div className="mb-[18px] grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
            Rep
            <Select value={rep} onValueChange={setRep}>
              <SelectTrigger className="h-8 font-sans text-[12.5px] font-normal normal-case tracking-normal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(reps).map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
            Deal
            <Select value={dealId} onValueChange={setDealId}>
              <SelectTrigger className="h-8 font-sans text-[12.5px] font-normal normal-case tracking-normal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {Object.values(deals).map((deal) => (
                  <SelectItem key={deal.id} value={deal.id}>
                    {deal.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setUploadOpen(false)}>
            Cancel
          </Button>
          <Button className="bg-brand text-white hover:bg-brand-hover" onClick={submit}>
            Add call
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
