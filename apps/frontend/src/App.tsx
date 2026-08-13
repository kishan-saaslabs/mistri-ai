import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { AskPage } from "@/pages/AskPage";
import { CallsPage } from "@/pages/CallsPage";
import { DealsPage } from "@/pages/DealsPage";
import { WorkspaceProvider } from "@/state/workspace";

export default function App() {
  return (
    <WorkspaceProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/deals" replace />} />
          <Route path="/calls" element={<CallsPage />} />
          <Route path="/deals" element={<DealsPage />} />
          <Route path="/ask" element={<AskPage />} />
          <Route path="*" element={<Navigate to="/deals" replace />} />
        </Route>
      </Routes>
    </WorkspaceProvider>
  );
}
