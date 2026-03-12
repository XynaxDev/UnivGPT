import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import Landing from '@/pages/Landing';
import Login from '@/pages/auth/Login';
import Signup from '@/pages/auth/Signup';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import VerifyEmail from '@/pages/auth/VerifyEmail';
import AuthCallback from '@/pages/auth/AuthCallback';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StudentDashboard from '@/pages/dashboard/StudentDashboard';
import FacultyDashboard from '@/pages/dashboard/FacultyDashboard';
import AdminDashboard from '@/pages/dashboard/AdminDashboard';
import ChatPage from '@/pages/dashboard/ChatPage';
import CoursesPage from '@/pages/dashboard/CoursesPage';
import UsersPage from '@/pages/dashboard/UsersPage';
import AuditPage from '@/pages/dashboard/AuditPage';
import SettingsPage from '@/pages/dashboard/SettingsPage';
import ProfilePage from '@/pages/dashboard/ProfilePage';
import UploadPage from '@/pages/dashboard/UploadPage';
import AuthLayout from '@/components/layout/AuthLayout';
import SmoothScroll from '@/components/layout/SmoothScroll';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { authApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';

const academicDomain = (import.meta.env.VITE_ACADEMIC_EMAIL_DOMAIN || 'krmu.edu.in').toLowerCase();
const isAcademicEmail = (email?: string) => (email || '').trim().toLowerCase().endsWith(`@${academicDomain}`);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}

function DashboardHome() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/auth/login" replace />;
  switch (user.role) {
    case 'admin': return <AdminDashboard />;
    case 'faculty': return <FacultyDashboard />;
    default: return <StudentDashboard />;
  }
}

export default function App() {
  const { setSession, logout, isInitializing, finishInitializing } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const user = await authApi.getMe(session.access_token);
          setSession(session.access_token, user);
        } catch (err) {
          console.warn('Syncing existing session failed:', err);
          setSession(session.access_token, {
            id: session.user.id,
            email: session.user.email || '',
            full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'User',
            role: (session.user.user_metadata?.role as any) || 'student',
            academic_verified: isAcademicEmail(session.user.email || ''),
            identity_provider: session.user.app_metadata?.provider || session.user.app_metadata?.providers?.[0] || 'email',
          });
        }
      } else {
        finishInitializing();
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔥 Auth Event:', event);
      if (session?.access_token) {
        try {
          const user = await authApi.getMe(session.access_token);
          setSession(session.access_token, user);
        } catch (err) {
          console.warn('Backend sync failed:', err);
          setSession(session.access_token, {
            id: session.user.id,
            email: session.user.email || '',
            full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Google User',
            role: (session.user.user_metadata?.role as any) || 'student',
            academic_verified: isAcademicEmail(session.user.email || ''),
            identity_provider: session.user.app_metadata?.provider || session.user.app_metadata?.providers?.[0] || 'email',
          });
        }
      } else if (event === 'SIGNED_OUT') {
        logout();
      }
      finishInitializing();
    });

    return () => subscription.unsubscribe();
  }, [setSession, logout, finishInitializing]);

  if (isInitializing) {
    return (
      <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-3xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center animate-pulse">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
          <div className="absolute -inset-4 bg-orange-500/5 blur-2xl rounded-full" />
        </div>
        <p className="text-zinc-500 font-medium animate-pulse">Initializing UnivGPT...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <SmoothScroll>
        <ToastProvider />
        <div className="dark">
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />

            <Route element={<AuthLayout><Outlet /></AuthLayout>}>
              <Route path="/auth/login" element={<Login />} />
              <Route path="/auth/signup" element={<Signup />} />
              <Route path="/auth/forgot-password" element={<ForgotPassword />} />
              <Route path="/auth/verify-email" element={<VerifyEmail />} />
            </Route>

            {/* OAuth Callback */}
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Protected Dashboard */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardHome />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="courses" element={<CoursesPage />} />
              <Route path="documents" element={<UploadPage />} />
              <Route path="upload" element={<UploadPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </SmoothScroll>
    </BrowserRouter>
  );
}
