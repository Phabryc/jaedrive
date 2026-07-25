import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireProfile } from "./components/RequireProfile";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Pair from "./pages/Pair";
import Dashboard from "./pages/Dashboard";
import Trips from "./pages/Trips";
import TripDetail from "./pages/TripDetail";
import Settings from "./pages/Settings";

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <RequireProfile>{children}</RequireProfile>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/pair" element={<Protected><Pair /></Protected>} />
      <Route path="/vehicles/:vehicleId/trips" element={<Protected><Trips /></Protected>} />
      <Route path="/trips/:id" element={<Protected><TripDetail /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
