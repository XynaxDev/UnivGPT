/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { lazy } from 'react';

type Loader<T extends React.ComponentType<any>> = () => Promise<{ default: T }>;

const CHUNK_RELOAD_FLAG = 'unigpt:chunk-reload-once';

function isChunkLoadFailure(error: unknown): boolean {
    const message = String((error as any)?.message || error || '').toLowerCase();
    return (
        message.includes('failed to fetch dynamically imported module') ||
        message.includes('importing a module script failed') ||
        message.includes('dynamically imported module')
    );
}

async function loadWithChunkRecovery<T extends React.ComponentType<any>>(loader: Loader<T>) {
    try {
        return await loader();
    } catch (error) {
        if (!isChunkLoadFailure(error) || typeof window === 'undefined') {
            throw error;
        }

        const alreadyRetried = window.sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1';
        if (!alreadyRetried) {
            window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
            // Force a full reload so the browser fetches the latest HTML that points to valid hashed assets.
            window.location.reload();
            return new Promise<never>(() => undefined);
        }

        window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
        throw error;
    }
}

export function lazyWithPreload<T extends React.ComponentType<any>>(loader: Loader<T>) {
    const guardedLoader: Loader<T> = () => loadWithChunkRecovery(loader);
    const Component = lazy(guardedLoader) as React.LazyExoticComponent<T> & { preload: Loader<T> };
    Component.preload = guardedLoader;
    return Component;
}

const routeLoaders = {
    '/': () => import('@/pages/Landing'),
    '/auth/login': () => import('@/pages/auth/Login'),
    '/auth/signup': () => import('@/pages/auth/Signup'),
    '/auth/forgot-password': () => import('@/pages/auth/ForgotPassword'),
    '/auth/verify-email': () => import('@/pages/auth/VerifyEmail'),
    '/auth/callback': () => import('@/pages/auth/AuthCallback'),
    '/dashboard': () => import('@/pages/dashboard/StudentDashboard'),
    '/dashboard/chat': () => import('@/pages/dashboard/ChatPage'),
    '/dashboard/courses': () => import('@/pages/dashboard/CoursesPage'),
    '/dashboard/documents': () => import('@/pages/dashboard/UploadPage'),
    '/dashboard/upload': () => import('@/pages/dashboard/UploadPage'),
    '/dashboard/notices': () => import('@/pages/dashboard/NoticesPage'),
    '/dashboard/timetable': () => import('@/pages/dashboard/TimetablePage'),
    '/dashboard/users': () => import('@/pages/dashboard/UsersPage'),
    '/dashboard/audit': () => import('@/pages/dashboard/AuditPage'),
    '/dashboard/settings': () => import('@/pages/dashboard/SettingsPage'),
    '/dashboard/profile': () => import('@/pages/dashboard/ProfilePage'),
    '/dashboard/notifications': () => import('@/pages/dashboard/NotificationsPage'),
    '/dashboard/faculty': () => import('@/pages/dashboard/FacultyDirectoryPage'),
    '/dashboard/dean': () => import('@/pages/dashboard/DeanAppealsPage'),
} satisfies Record<string, Loader<any>>;

const prefetchedRoutes = new Set<string>();

export function preloadRoute(pathname?: string | null) {
    if (!pathname) return;
    const normalized = String(pathname).split('?')[0].replace(/\/+$/, '') || '/';
    const loader =
        routeLoaders[normalized as keyof typeof routeLoaders] ||
        (normalized.startsWith('/dashboard/faculty/')
            ? (() => import('@/pages/dashboard/FacultyProfilePage'))
            : null);
    if (!loader || prefetchedRoutes.has(normalized)) return;
    prefetchedRoutes.add(normalized);
    void loader().catch(() => {
        prefetchedRoutes.delete(normalized);
    });
}
