import { ThemeProvider } from "next-themes";
import { Outlet } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AskBar } from "@/components/layout/AskBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { EvidenceDialog } from "@/components/calls/EvidenceDialog";
import { UploadCallDialog } from "@/components/calls/UploadCallDialog";

export function AppShell() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <div className="flex h-svh overflow-hidden bg-background">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AskBar />
            <main className="min-h-0 flex-1 overflow-hidden">
              <Outlet />
            </main>
          </div>
          <div className="pointer-events-none fixed bottom-3.5 left-3.5 z-30 rounded-md border border-border bg-white px-2.5 py-1 font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase md:left-[244px]">
            Ask Mistri uses demo responses
          </div>
        </div>
        <UploadCallDialog />
        <EvidenceDialog />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
