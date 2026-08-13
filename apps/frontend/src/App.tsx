import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AskPage } from "@/pages/AskPage";
import { DealDetailPage } from "@/pages/DealDetailPage";
import { DealsPage } from "@/pages/DealsPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { TeamPage } from "@/pages/TeamPage";
import { AuthProvider, useAuth } from "@/state/auth";
import { WorkspaceProvider } from "@/state/workspace";

/** Keeps signed-in users out of the login/register screens. */
function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/deals" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route
            element={
              <WorkspaceProvider>
                <AppShell />
              </WorkspaceProvider>
            }
          >
            <Route path="/" element={<Navigate to="/deals" replace />} />
            <Route path="/calls" element={<Navigate to="/deals" replace />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/deals/:id" element={<DealDetailPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/ask" element={<AskPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/deals" replace />} />
      </Routes>
    </AuthProvider>
  );
}
