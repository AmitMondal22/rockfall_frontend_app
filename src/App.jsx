import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { ThemeProvider } from './context/ThemeContext';
const Layout = lazy(() => import('./components/Layout'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DevicesPage = lazy(() => import('./pages/DevicesPage'));
const DeviceDetailsPage = lazy(() => import('./pages/DeviceDetailsPage'));
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage'));
const OrgDashboardPage = lazy(() => import('./pages/OrgDashboardPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDashboardPage = lazy(() => import('./pages/ProjectDashboardPage'));
const LocationsPage = lazy(() => import('./pages/LocationsPage'));
const LocationDashboardPage = lazy(() => import('./pages/LocationDashboardPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const HistoricalDataPage = lazy(() => import('./pages/HistoricalDataPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AssetManagementPage = lazy(() => import('./pages/AssetManagementPage'));
const AssetDetailsPage = lazy(() => import('./pages/AssetDetailsPage'));
const AddBarrierAssetPage = lazy(() => import('./pages/AddBarrierAssetPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));

const LoadingScreen = () => (
  <div className="min-h-screen bg-primary flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-border border-t-indigo-500 rounded-full animate-spin" />
  </div>
);

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/assets/new" element={<AddBarrierAssetPage />} />
        <Route path="/assets/:id/edit" element={<AddBarrierAssetPage />} />
        <Route path="/assets/:id" element={<AssetDetailsPage />} />
        <Route path="/assets" element={<AssetManagementPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/devices/:id" element={<DeviceDetailsPage />} />
        <Route path="/organizations" element={<OrganizationsPage />} />
        <Route path="/organizations/:id" element={<OrgDashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDashboardPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/locations/:id" element={<LocationDashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/alert-rules" element={<Navigate to="/alerts" replace />} />
        <Route path="/historical" element={<HistoricalDataPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={<LoadingScreen />}>
            <AppRoutes />
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
