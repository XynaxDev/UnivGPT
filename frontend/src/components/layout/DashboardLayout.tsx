/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
    LayoutDashboard, LogOut, Bell,
    MessageSquare, FileText, Users, Shield, Settings,
    BookOpen, ChevronRight, GraduationCap, ShieldAlert, Megaphone, CalendarDays
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from '@/components/ui/sidebar';
import { useToastStore } from '@/store/toastStore';
import { authApi, type UserNotificationItem } from '@/lib/api';
import { HoverTooltip } from '@/components/ui/tooltip';
import { preloadRoute } from '@/lib/routePrefetch';

export default function DashboardLayout() {
    const { user, logout, token } = useAuthStore();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [notifications, setNotifications] = useState<UserNotificationItem[]>(
        () => (token ? authApi.peekNotifications(token, 6)?.notifications || [] : []),
    );
    const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
    const { showToast } = useToastStore();
    const location = useLocation();
    const navigate = useNavigate();
    const isChatRoute = location.pathname === '/dashboard/chat';

    const role = user?.role || 'student';
    const normalizeDisplayName = (fullName?: string | null) => {
        const raw = String(fullName || '').trim();
        if (!raw) return 'there';
        const stripped = raw.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').trim();
        const token = stripped.split(/\s+/).filter(Boolean)[0];
        return token || 'there';
    };
    const firstName = normalizeDisplayName(user?.full_name);

    type DashboardNavItem = {
        label: string;
        href: string;
        icon: React.ReactNode;
        prefetch?: () => void;
    };

    const navigation: Record<string, DashboardNavItem[]> = {
        student: [
            { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard') },
            { label: 'Student AI', href: '/dashboard/chat', icon: <MessageSquare className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/chat') },
            { label: 'My Courses', href: '/dashboard/courses', icon: <BookOpen className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/courses') },
            { label: 'Timetable', href: '/dashboard/timetable', icon: <CalendarDays className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/timetable') },
            { label: 'Faculty', href: '/dashboard/faculty', icon: <GraduationCap className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/faculty') },
            { label: 'Notifications', href: '/dashboard/notifications', icon: <Bell className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/notifications') },
            { label: 'Settings', href: '/dashboard/settings', icon: <Settings className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/settings') },
        ],
        faculty: [
            { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard') },
            { label: 'Faculty AI', href: '/dashboard/chat', icon: <MessageSquare className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/chat') },
            { label: 'Timetable', href: '/dashboard/timetable', icon: <CalendarDays className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/timetable') },
            { label: 'Documents', href: '/dashboard/documents', icon: <FileText className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/documents') },
            { label: 'Notices', href: '/dashboard/notices', icon: <Megaphone className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/notices') },
            { label: 'Notifications', href: '/dashboard/notifications', icon: <Bell className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/notifications') },
            { label: 'Settings', href: '/dashboard/settings', icon: <Settings className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/settings') },
        ],
        admin: [
            { label: 'Overview', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard') },
            { label: 'Admin AI', href: '/dashboard/chat', icon: <MessageSquare className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/chat') },
            { label: 'Users', href: '/dashboard/users', icon: <Users className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/users') },
            { label: 'Documents', href: '/dashboard/documents', icon: <FileText className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/documents') },
            { label: 'Notices', href: '/dashboard/notices', icon: <Megaphone className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/notices') },
            { label: 'Audit Logs', href: '/dashboard/audit', icon: <Shield className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/audit') },
            { label: 'Dean Desk', href: '/dashboard/dean', icon: <ShieldAlert className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/dean') },
            { label: 'Notifications', href: '/dashboard/notifications', icon: <Bell className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/notifications') },
            { label: 'Settings', href: '/dashboard/settings', icon: <Settings className="w-5 h-5 shrink-0" />, prefetch: () => preloadRoute('/dashboard/settings') },
        ],
    };

    const currentNav = navigation[role] || navigation.student;

    // Derive page title from current nav
    const currentPage = currentNav.find(item => location.pathname === item.href);
    let pageTitle = currentPage?.label || 'Dashboard';
    if (location.pathname === '/dashboard/profile') pageTitle = 'Profile';
    if (location.pathname === '/dashboard/faculty') pageTitle = 'Faculty';
    if (location.pathname.startsWith('/dashboard/faculty/')) pageTitle = 'Faculty Profile';
    const pageDescriptions: Record<string, string> = {
        '/dashboard': role === 'admin'
            ? `Welcome back, ${firstName}. Control center and operational insights`
            : role === 'faculty'
                ? `Welcome back, ${firstName}. Department operations and circulars`
                : `Welcome back, ${firstName}. Your university workspace`,
        '/dashboard/chat': role === 'admin'
            ? 'Ask admin operations queries: users, audits, docs, and moderation'
            : role === 'faculty'
                ? 'Ask faculty workflow queries: circulars, classes, and department updates'
                : 'Ask student support queries: courses, notices, and deadlines',
        '/dashboard/courses': 'Browse courses, calendars, and syllabus',
        '/dashboard/documents': 'Upload, route, and manage document access',
        '/dashboard/upload': 'Upload, route, and manage document access',
        '/dashboard/notices': 'Send role-targeted notices to students and faculty',
        '/dashboard/timetable': role === 'faculty'
            ? 'Weekly teaching schedule and class slots'
            : 'Weekly class timetable and today schedule',
        '/dashboard/users': 'Manage accounts, roles, and status',
        '/dashboard/audit': 'Track platform activity and events',
        '/dashboard/dean': 'Review moderation appeals and restore user chat access',
        '/dashboard/settings': 'Preferences, security, and account controls',
        '/dashboard/profile': 'Personal details and identity settings',
        '/dashboard/notifications': 'Live updates for your role, department, and courses',
        '/dashboard/faculty': 'Faculty mapped to your courses and department',
        '/dashboard/faculty/:id': 'Faculty member details and mapped courses',
    };
    const pageSubtitle = location.pathname.startsWith('/dashboard/faculty/')
        ? pageDescriptions['/dashboard/faculty/:id']
        : (pageDescriptions[location.pathname] || 'Workspace');

    const handleLogout = async () => {
        setShowLogoutConfirm(true);
    };

    const confirmLogout = async () => {
        try {
            setIsLoggingOut(true);
            await logout();
            setShowNotifications(false);
            setShowLogoutConfirm(false);
            showToast("Signed out successfully", "success");
            navigate('/auth/login', { replace: true });
        } finally {
            setIsLoggingOut(false);
        }
    };

    const unreadCount = useMemo(() => notifications.filter((n) => n.unread).length, [notifications]);

    const formatTimeAgo = (iso?: string | null) => {
        if (!iso) return 'Just now';
        const ms = Date.now() - new Date(iso).getTime();
        const mins = Math.max(1, Math.floor(ms / 60000));
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    useEffect(() => {
        const pendingToast = window.sessionStorage.getItem('unigpt:pending-toast');
        if (!pendingToast) return;
        try {
            const parsed = JSON.parse(pendingToast) as { message?: string; type?: 'success' | 'error' | 'info' };
            if (parsed.message) {
                showToast(parsed.message, parsed.type || 'success');
            }
        } catch {
            showToast('Signed in successfully.', 'success');
        } finally {
            window.sessionStorage.removeItem('unigpt:pending-toast');
        }
    }, [showToast]);

    useEffect(() => {
        let active = true;
        const loadTopbarData = async () => {
            if (!token) return;
            try {
                const notificationRes = await authApi.getNotifications(token, 6);
                if (!active) return;
                const isAdmin = String(role).toLowerCase() === 'admin';
                const filtered = (notificationRes.notifications || []).filter((item) => {
                    if (isAdmin) return true;
                    return !(item.id.startsWith('report:') || item.id.startsWith('appeal'));
                });
                setNotifications(filtered);
            } catch {
                if (!active) return;
                setNotifications([]);
            }
        };
        loadTopbarData();
        return () => {
            active = false;
        };
    }, [token, role]);

    useEffect(() => {
        if (!showNotifications || !token || unreadCount <= 0) return;
        authApi.markNotificationsRead(token).catch(() => undefined);
        setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })));
    }, [showNotifications, unreadCount, token]);

    useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);

    // Get profile image from store (would be set by ProfilePage)
    const profileImage = (user as any)?.profileImage || null;
    const userInitial = user?.full_name?.charAt(0) || 'U';

    const ProfileAvatar = ({ size = 'sm' }: { size?: 'sm' | 'md' }) => {
        const dim = size === 'sm' ? 'w-8 h-8' : 'w-7 h-7';
        const textSize = size === 'sm' ? 'text-[11px]' : 'text-[10px]';
        return (
            <div className={`${dim} rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0 overflow-hidden`}>
                {profileImage ? (
                    <img src={profileImage} alt="" className="w-full h-full object-cover" />
                ) : (
                    <span className={`${textSize} font-bold text-white`}>{userInitial}</span>
                )}
            </div>
        );
    };

    const SidebarBrand = () => {
        const { hovered } = useSidebar();
        return (
            <div className="hidden md:flex items-center gap-3 px-3 mb-6 mt-5 h-10 shrink-0 overflow-hidden">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-white/10">
                    <BrandLogo className="w-6 h-6 text-black" />
                </div>
                <AnimatePresence initial={false}>
                    {hovered && (
                        <motion.span
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.16 }}
                            className="text-xl font-extrabold text-white tracking-tight leading-none whitespace-nowrap overflow-hidden pointer-events-none"
                            style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}
                        >
                            Univ<span className="text-orange-500">GPT</span>
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    return (
        <div className="flex min-h-[100dvh] w-full overflow-x-hidden overflow-y-auto bg-[#050507] text-white touch-pan-y md:h-screen md:overflow-hidden md:overflow-y-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Sticky Sidebar */}
            <div className="sticky top-0 h-screen shrink-0 z-50 bg-black border-r border-white/[0.07]">
                <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
                    <SidebarBody className="justify-between gap-6 py-2">
                        {/* Top: Logo + Nav */}
                        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden scrollbar-none" data-lenis-prevent="true">
                            {/* Brand Logo - Fixed at top of sidebar, Desktop Only */}
                            <SidebarBrand />

                            {/* Nav Links */}
                            <div className="flex flex-col gap-1">
                                {currentNav.map((item) => (
                                    <SidebarLink
                                        key={item.href}
                                        link={item}
                                        active={location.pathname === item.href}
                                    />
                                ))}
                            </div>

                        </div>

                        {/* Bottom: User + Logout */}
                        <div className="flex flex-col gap-1">
                            <SidebarLink
                                link={{
                                    label: 'Profile',
                                    href: '/dashboard/profile',
                                    icon: <ProfileAvatar size="md" />,
                                    prefetch: () => preloadRoute('/dashboard/profile'),
                                }}
                                active={location.pathname === '/dashboard/profile'}
                            />
                            <SidebarLink
                                link={{
                                    label: 'Sign out',
                                    href: '#',
                                    icon: <LogOut className="w-5 h-5 shrink-0" />,
                                }}
                                onClick={handleLogout}
                                className="text-zinc-500 hover:text-red-400"
                            />
                        </div>
                    </SidebarBody>
                </Sidebar>
            </div>

            {/* Content Area */}
            <div className="flex min-w-0 flex-1 flex-col bg-[#050507] pt-0 min-h-[100dvh] md:min-h-0 md:overflow-hidden md:pb-2 md:pr-2">
                <div className="relative flex min-h-[100dvh] flex-1 flex-col bg-[#06070a] touch-pan-y md:min-h-0 md:overflow-hidden md:rounded-tl-[30px] md:border-l md:border-t md:border-white/[0.07]" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <header className="sticky top-0 z-40 flex h-20 shrink-0 items-center justify-between bg-[#06070a] px-4 sm:px-6 md:px-8 lg:border-b lg:border-white/[0.06]">
                        <div className="flex items-center gap-4">
                            {/* Mobile Brand Toggle */}
                            <button
                                onClick={() => setSidebarOpen((prev) => !prev)}
                                className={cn(
                                    "md:hidden flex items-center gap-3 shrink-0 active:scale-95 transition-all min-w-0",
                                    sidebarOpen && "opacity-0 pointer-events-none",
                                )}
                            >
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-white/10">
                                    <BrandLogo className="w-6 h-6 text-black" />
                                </div>
                                <span
                                    className="text-xl font-extrabold text-white tracking-tight"
                                    style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}
                                >
                                    Univ<span className="text-orange-500">GPT</span>
                                </span>
                            </button>

                            {/* Page Title - Desktop Only */}
                            <div className="hidden md:flex items-center">
                                <div className="ml-4">
                                    <h2
                                        className="text-xl font-extrabold text-white tracking-tight"
                                        style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}
                                    >
                                        {pageTitle}
                                    </h2>
                                    <p className="text-[11px] text-zinc-500 mt-0.5">{pageSubtitle}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Notification Bell */}
                            <div className="relative">
                                <HoverTooltip content="Open notifications">
                                    <button
                                        onClick={() => {
                                            setIsLoadingNotifications(true);
                                            setShowNotifications((prev) => !prev);
                                            setTimeout(() => setIsLoadingNotifications(false), 150);
                                        }}
                                        className="w-9 h-9 flex items-center justify-center text-zinc-500 hover:text-white transition-colors rounded-full hover:bg-white/[0.06] relative"
                                    >
                                        <Bell className="w-[18px] h-[18px]" />
                                        {unreadCount > 0 && (
                                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full" />
                                        )}
                                    </button>
                                </HoverTooltip>

                                <AnimatePresence>
                                    {showNotifications && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 8, scale: 0.96 }}
                                            className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-[4.75rem] sm:top-[calc(100%+0.5rem)] sm:w-80 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[120] origin-top-right"
                                            data-lenis-prevent
                                        >
                                            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                                                <span className="text-sm font-semibold text-white">Notifications</span>
                                                <span className="text-[10px] text-orange-400 font-semibold">{unreadCount} new</span>
                                            </div>
                                            <div
                                                className="max-h-[min(65vh,18rem)] overflow-y-auto overflow-x-hidden overscroll-contain"
                                                data-lenis-prevent
                                            >
                                                {isLoadingNotifications && (
                                                    <div className="p-3 space-y-2.5">
                                                        {Array.from({ length: 4 }).map((_, idx) => (
                                                            <div key={`nav-notification-skeleton-${idx}`} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                                                                <div className="flex gap-2">
                                                                    <Skeleton className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" />
                                                                    <div className="flex-1 space-y-2">
                                                                        <Skeleton className="h-3 w-36" />
                                                                        <Skeleton className="h-3 w-full" />
                                                                        <Skeleton className="h-3 w-24" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {!isLoadingNotifications && notifications.length === 0 && (
                                                    <div className="px-4 py-6 text-xs text-zinc-500">
                                                        No notifications yet.
                                                    </div>
                                                )}
                                                {!isLoadingNotifications && notifications.map((n) => (
                                                    <div
                                                        key={n.id}
                                                        className={cn("px-4 py-3 hover:bg-white/[0.03] cursor-pointer border-b border-white/[0.04] last:border-0 transition-colors", n.unread && "bg-orange-500/[0.03]")}
                                                        onClick={() => {
                                                            setShowNotifications(false);
                                                            setIsLoadingNotifications(false);
                                                            navigate('/dashboard/notifications', { state: { focusNotificationId: n.id } });
                                                        }}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            {n.unread ? (
                                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                                                            ) : (
                                                                <div className="w-1.5 h-1.5 opacity-0 shrink-0" />
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs text-zinc-300 leading-relaxed font-medium break-words">{n.title}</p>
                                                                <p className="text-[11px] text-zinc-500 mt-1 break-words">{n.message}</p>
                                                                <p className="text-[10px] text-zinc-600 mt-1">{formatTimeAgo(n.uploaded_at)}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <HoverTooltip content="Open full notifications page" side="top">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowNotifications(false);
                                                        setIsLoadingNotifications(false);
                                                        navigate('/dashboard/notifications');
                                                    }}
                                                    className="w-full px-4 py-3 text-xs text-orange-300 hover:text-orange-200 border-t border-white/[0.06] flex items-center justify-center gap-1.5 bg-black/40 hover:bg-white/[0.03]"
                                                >
                                                    View all notifications <ChevronRight className="w-3.5 h-3.5" />
                                                </button>
                                            </HoverTooltip>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Profile */}
                            <HoverTooltip content="Open profile">
                                <button
                                    onClick={() => navigate('/dashboard/profile')}
                                    className="hover:scale-110 transition-transform"
                                >
                                    <ProfileAvatar size="sm" />
                                </button>
                            </HoverTooltip>
                        </div>
                    </header>

                    {/* Native Scrollable Content */}
                    <div
                        className={cn(
                            "relative z-10 mx-auto flex-1 w-full overflow-x-hidden",
                            isChatRoute
                                ? "min-h-0 overflow-hidden h-[calc(100dvh-5rem)] md:h-auto"
                                : "overflow-y-auto overscroll-contain touch-pan-y",
                        )}
                        data-lenis-prevent="true"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={location.pathname}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className={cn(isChatRoute ? "flex h-full min-h-0 flex-col" : "min-h-full")}
                            >
                                <Outlet />
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
                {/* Backdrop for notifications */}
                {showNotifications && (
                    <div className="fixed inset-0 z-[20]" onClick={() => setShowNotifications(false)} />
                )}
                {showLogoutConfirm && (
                    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 px-4">
                        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111216] p-6 shadow-2xl shadow-black/40">
                            <div className="text-lg font-bold text-white">Log out?</div>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                                Are you sure you want to log out of UnivGPT on this device?
                            </p>
                            <div className="mt-5 flex justify-end gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                                    onClick={() => setShowLogoutConfirm(false)}
                                    disabled={isLoggingOut}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    className="bg-red-600 text-white hover:bg-red-500"
                                    onClick={confirmLogout}
                                    disabled={isLoggingOut}
                                >
                                    {isLoggingOut ? 'Logging out...' : 'Log Out'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


