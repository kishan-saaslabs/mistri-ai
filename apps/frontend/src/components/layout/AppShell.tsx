import { useState } from "react";
import { Outlet } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AskBar } from "@/components/layout/AskBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { EvidenceDialog } from "@/components/calls/EvidenceDialog";
import { UploadCallDialog } from "@/components/calls/UploadCallDialog";

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <TooltipProvider>
      <div className="flex h-svh overflow-hidden bg-background">
        <Sidebar open={navOpen} onOpenChange={setNavOpen} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AskBar navOpen={navOpen} onOpenNav={() => setNavOpen(true)} />
          <main className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
      <UploadCallDialog />
      <EvidenceDialog />
      <Toaster />
    </TooltipProvider>
  );
}
