/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { lazyWithPreload } from '@/lib/routePrefetch';
import DashboardLayout from '@/components/layout/DashboardLayout';
import AuthLayout from '@/components/layout/AuthLayout';
import SmoothScroll from '@/components/layout/SmoothScroll';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { Suspense, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { authApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';

const Landing = lazyWithPreload(() => import('@/pages/Landing'));
const Login = lazyWithPreload(() => import('@/pages/auth/Login'));
const Signup = lazyWithPreload(() => import('@/pages/auth/Signup'));
const ForgotPassword = lazyWithPreload(() => import('@/pages/auth/ForgotPassword'));
const VerifyEmail = lazyWithPreload(() => import('@/pages/auth/VerifyEmail'));
const AuthCallback = lazyWithPreload(() => import('@/pages/auth/AuthCallback'));
const StudentDashboard = lazyWithPreload(() => import('@/pages/dashboard/StudentDashboard'));
const FacultyDashboard = lazyWithPreload(() => import('@/pages/dashboard/FacultyDashboard'));
const TimetablePage = lazyWithPreload(() => import('@/pages/dashboard/TimetablePage'));
const AdminDashboard = lazyWithPreload(() => import('@/pages/dashboard/AdminDashboard'));
const ChatPage = lazyWithPreload(() => import('@/pages/dashboard/ChatPage'));
const CoursesPage = lazyWithPreload(() => import('@/pages/dashboard/CoursesPage'));
const UsersPage = lazyWithPreload(() => import('@/pages/dashboard/UsersPage'));
const AuditPage = lazyWithPreload(() => import('@/pages/dashboard/AuditPage'));
const SettingsPage = lazyWithPreload(() => import('@/pages/dashboard/SettingsPage'));
const ProfilePage = lazyWithPreload(() => import('@/pages/dashboard/ProfilePage'));
const UploadPage = lazyWithPreload(() => import('@/pages/dashboard/UploadPage'));
const NotificationsPage = lazyWithPreload(() => import('@/pages/dashboard/NotificationsPage'));
const NoticesPage = lazyWithPreload(() => import('@/pages/dashboard/NoticesPage'));
const FacultyProfilePage = lazyWithPreload(() => import('@/pages/dashboard/FacultyProfilePage'));
const FacultyDirectoryPage = lazyWithPreload(() => import('@/pages/dashboard/FacultyDirectoryPage'));
const DeanAppealsPage = lazyWithPreload(() => import('@/pages/dashboard/DeanAppealsPage'));

const academicDomain = (import.meta.env.VITE_ACADEMIC_EMAIL_DOMAIN || '').toLowerCase();
const isAcademicEmail = (email?: string) => (email || '').trim().toLowerCase().endsWith(`@${academicDomain}`);
const VALID_ROLES = new Set(['student', 'faculty', 'admin']);
const normalizeRole = (value?: string | null): 'student' | 'faculty' | 'admin' | null => {
  const role = String(value || '').trim().toLowerCase();
  return VALID_ROLES.has(role) ? (role as 'student' | 'faculty' | 'admin') : null;
};

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}

function RoleRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: Array<'student' | 'faculty' | 'admin'>;
  children: React.ReactNode;
}) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/auth/login" replace />;
  const role = String(user.role || 'student').toLowerCase() as 'student' | 'faculty' | 'admin';
  if (!allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }
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

function RouteSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] w-full flex items-center justify-center">
          <div className="flex items-center gap-3 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
            <span className="text-sm">Loading page...</span>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export default function App() {
  const { setSession, clearSession, isInitializing, finishInitializing } = useAuthStore();
  const lastSyncedTokenRef = useRef<string | null>(null);
  const getCurrentUser = () => useAuthStore.getState().user;

  useEffect(() => {
    const syncSessionToBackend = async (session: any, fallbackName: string, options?: { force?: boolean }) => {
      if (!session?.access_token) return;
      const force = Boolean(options?.force);
      if (!force && lastSyncedTokenRef.current === session.access_token && getCurrentUser()) return;

      try {
        const refreshedUser = force
          ? await authApi.refreshMe(session.access_token, getCurrentUser() || undefined)
          : await authApi.getMe(session.access_token, getCurrentUser() || undefined);
        setSession(session.access_token, refreshedUser);
      } catch (err) {
        console.warn('Session sync failed, attempting safe metadata fallback:', err);
        const fallbackRole =
          normalizeRole(getCurrentUser()?.role) ||
          normalizeRole(session.user.user_metadata?.role as string);
        if (!fallbackRole) {
          lastSyncedTokenRef.current = null;
          clearSession();
          return;
        }
        setSession(session.access_token, {
          id: session.user.id,
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || fallbackName,
          role: fallbackRole,
          academic_verified: isAcademicEmail(session.user.email || ''),
          identity_provider: session.user.app_metadata?.provider || session.user.app_metadata?.providers?.[0] || 'email',
        });
      } finally {
        lastSyncedTokenRef.current = session.access_token;
      }
    };

    const initAuth = async () => {
      const persistedState = useAuthStore.getState();
      const persistedToken = persistedState.token;
      const persistedUser = persistedState.user;
      if (persistedToken && persistedUser) {
        lastSyncedTokenRef.current = persistedToken;
        finishInitializing();
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const hasPersistedMatch =
          persistedToken === session.access_token && Boolean(persistedUser);
        if (!hasPersistedMatch) {
          await syncSessionToBackend(session, 'User');
        }
      } else {
        lastSyncedTokenRef.current = null;
        if (persistedToken) {
          clearSession();
        }
      }
      finishInitializing();
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth Event:', event);
      if (event === 'INITIAL_SESSION') {
        return;
      }
      if (session?.access_token) {
        await syncSessionToBackend(session, 'Google User', { force: event === 'USER_UPDATED' });
      } else if (event === 'SIGNED_OUT') {
        lastSyncedTokenRef.current = null;
        clearSession();
      }
      finishInitializing();
    });

    return () => subscription.unsubscribe();
  }, [setSession, clearSession, finishInitializing]);

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
            <Route path="/" element={<RouteSuspense><Landing /></RouteSuspense>} />

            <Route element={<AuthLayout><Outlet /></AuthLayout>}>
              <Route path="/auth/login" element={<RouteSuspense><Login /></RouteSuspense>} />
              <Route path="/auth/signup" element={<RouteSuspense><Signup /></RouteSuspense>} />
              <Route path="/auth/forgot-password" element={<RouteSuspense><ForgotPassword /></RouteSuspense>} />
              <Route path="/auth/verify-email" element={<RouteSuspense><VerifyEmail /></RouteSuspense>} />
            </Route>

            {/* OAuth Callback */}
            <Route path="/auth/callback" element={<RouteSuspense><AuthCallback /></RouteSuspense>} />

            {/* Protected Dashboard */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<RouteSuspense><DashboardHome /></RouteSuspense>} />
              <Route path="chat" element={<RouteSuspense><ChatPage /></RouteSuspense>} />
              <Route
                path="courses"
                element={
                  <RoleRoute allowedRoles={['student', 'admin']}>
                    <RouteSuspense><CoursesPage /></RouteSuspense>
                  </RoleRoute>
                }
              />
              <Route
                path="documents"
                element={
                  <RoleRoute allowedRoles={['admin', 'faculty']}>
                    <RouteSuspense><UploadPage /></RouteSuspense>
                  </RoleRoute>
                }
              />
              <Route
                path="upload"
                element={
                  <RoleRoute allowedRoles={['admin', 'faculty']}>
                    <RouteSuspense><UploadPage /></RouteSuspense>
                  </RoleRoute>
                }
              />
              <Route
                path="notices"
                element={
                  <RoleRoute allowedRoles={['admin', 'faculty']}>
                    <RouteSuspense><NoticesPage /></RouteSuspense>
                  </RoleRoute>
                }
              />
              <Route
                path="timetable"
                element={
                  <RoleRoute allowedRoles={['student', 'faculty']}>
                    <RouteSuspense><TimetablePage /></RouteSuspense>
                  </RoleRoute>
                }
              />
              <Route
                path="users"
                element={
                  <RoleRoute allowedRoles={['admin']}>
                    <RouteSuspense><UsersPage /></RouteSuspense>
                  </RoleRoute>
                }
              />
              <Route
                path="audit"
                element={
                  <RoleRoute allowedRoles={['admin']}>
                    <RouteSuspense><AuditPage /></RouteSuspense>
                  </RoleRoute>
                }
              />
              <Route path="settings" element={<RouteSuspense><SettingsPage /></RouteSuspense>} />
              <Route path="profile" element={<RouteSuspense><ProfilePage /></RouteSuspense>} />
              <Route path="notifications" element={<RouteSuspense><NotificationsPage /></RouteSuspense>} />
              <Route
                path="faculty"
                element={
                  <RoleRoute allowedRoles={['student']}>
                    <RouteSuspense><FacultyDirectoryPage /></RouteSuspense>
                  </RoleRoute>
                }
              />
              <Route
                path="faculty/:id"
                element={
                  <RoleRoute allowedRoles={['student']}>
                    <RouteSuspense><FacultyProfilePage /></RouteSuspense>
                  </RoleRoute>
                }
              />
              <Route
                path="dean"
                element={
                  <RoleRoute allowedRoles={['admin']}>
                    <RouteSuspense><DeanAppealsPage /></RouteSuspense>
                  </RoleRoute>
                }
              />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </SmoothScroll>
    </BrowserRouter>
  );
}


