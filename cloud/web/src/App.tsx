import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireProfile } from "./components/RequireProfile";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Pair from "./pages/Pair";
import Dashboard from "./pages/Dashboard";
import Trips from "./pages/Trips";
import TripDetail from "./pages/TripDetail";
import RoutesPage from "./pages/Routes";
import RouteDetail from "./pages/RouteDetail";
import RouteEditor from "./pages/RouteEditor";
import Settings from "./pages/Settings";
import LegalDocument from "./pages/LegalDocument";
import ProfilePage from "./pages/Profile";
import AdminDashboard from "./pages/AdminDashboard";
import Plans from "./pages/Plans";

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
      {/* Pubblica (marketing) - la dashboard autenticata e' su /dashboard, vedi
          jaedrive_todo #7. Landing.tsx reindirizza da sola chi ha gia' una sessione attiva. */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      {/* Pubblica, nessun ProtectedRoute - deve restare leggibile anche prima del login. */}
      <Route path="/legal/:doc" element={<LegalDocument />} />
      <Route path="/plans" element={<Plans />} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/pair" element={<Protected><Pair /></Protected>} />
      <Route path="/vehicles/:vehicleId/trips" element={<Protected><Trips /></Protected>} />
      <Route path="/vehicles/:vehicleId/routes" element={<Protected><RoutesPage /></Protected>} />
      <Route path="/vehicles/:vehicleId/routes/new" element={<Protected><RouteEditor /></Protected>} />
      <Route path="/vehicles/:vehicleId/routes/:routeId/edit" element={<Protected><RouteEditor /></Protected>} />
      <Route path="/vehicles/:vehicleId/routes/:routeId" element={<Protected><RouteDetail /></Protected>} />
      <Route path="/trips/:id" element={<Protected><TripDetail /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/profile" element={<Navigate to="/settings" replace />} />
      <Route path="/admin" element={<Protected><AdminDashboard /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
