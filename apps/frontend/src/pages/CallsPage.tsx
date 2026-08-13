import { CallDetail } from "@/components/calls/CallDetail";
import { CallList } from "@/components/calls/CallList";

export function CallsPage() {
  return (
    <div className="flex h-full min-h-0">
      <CallList />
      <CallDetail />
    </div>
  );
}
