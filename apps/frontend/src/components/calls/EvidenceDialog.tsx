import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/state/workspace";

export function EvidenceDialog() {
  const { evidence, closeEvidence } = useWorkspace();

  return (
    <Dialog open={Boolean(evidence)} onOpenChange={(open) => !open && closeEvidence()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="font-mono text-[10.5px] font-normal tracking-[0.1em] text-muted-foreground uppercase">
            Evidence
          </DialogTitle>
        </DialogHeader>
        {evidence ? (
          <div>
            <div className="mb-2.5 flex justify-between text-xs text-ink-soft">
              <span>{evidence.speaker}</span>
              <span>{evidence.time}</span>
            </div>
            <div className="mb-1.5 text-[14.5px] leading-relaxed">{evidence.quote}</div>
            <div className="font-mono text-[10.5px] text-muted-foreground">{evidence.source}</div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
