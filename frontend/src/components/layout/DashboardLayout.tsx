import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
    LayoutDashboard, LogOut, Bell,
    MessageSquare, FileText, Users, Shield, Settings,
    BookOpen, ChevronRight, GraduationCap, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Sidebar, SidebarBody, SidebarLink } from '@/components/ui/sidebar';
import { useToastStore } from '@/store/toastStore';
import { authApi, type UserNotificationItem } from '@/lib/api';

export default function DashboardLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
    const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
    const { user, logout, token } = useAuthStore();
    const { showToast } = useToastStore();
    const location = useLocation();
    const navigate = useNavigate();

    const role = user?.role || 'student';

    const navigation: Record<string, { label: string; href: string; icon: React.ReactNode }[]> = {
        student: [
            { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5 shrink-0" /> },
            { label: 'Student AI', href: '/dashboard/chat', icon: <MessageSquare className="w-5 h-5 shrink-0" /> },
            { label: 'My Courses', href: '/dashboard/courses', icon: <BookOpen className="w-5 h-5 shrink-0" /> },
            { label: 'Faculty', href: '/dashboard/faculty', icon: <GraduationCap className="w-5 h-5 shrink-0" /> },
            { label: 'Notifications', href: '/dashboard/notifications', icon: <Bell className="w-5 h-5 shrink-0" /> },
            { label: 'Settings', href: '/dashboard/settings', icon: <Settings className="w-5 h-5 shrink-0" /> },
        ],
        faculty: [
            { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5 shrink-0" /> },
            { label: 'Faculty AI', href: '/dashboard/chat', icon: <MessageSquare className="w-5 h-5 shrink-0" /> },
            { label: 'Documents', href: '/dashboard/documents', icon: <FileText className="w-5 h-5 shrink-0" /> },
            { label: 'Courses', href: '/dashboard/courses', icon: <BookOpen className="w-5 h-5 shrink-0" /> },
            { label: 'Faculty', href: '/dashboard/faculty', icon: <GraduationCap className="w-5 h-5 shrink-0" /> },
            { label: 'Notifications', href: '/dashboard/notifications', icon: <Bell className="w-5 h-5 shrink-0" /> },
            { label: 'Settings', href: '/dashboard/settings', icon: <Settings className="w-5 h-5 shrink-0" /> },
        ],
        admin: [
            { label: 'Overview', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5 shrink-0" /> },
            { label: 'Admin AI', href: '/dashboard/chat', icon: <MessageSquare className="w-5 h-5 shrink-0" /> },
            { label: 'Users', href: '/dashboard/users', icon: <Users className="w-5 h-5 shrink-0" /> },
            { label: 'Documents', href: '/dashboard/documents', icon: <FileText className="w-5 h-5 shrink-0" /> },
            { label: 'Audit Logs', href: '/dashboard/audit', icon: <Shield className="w-5 h-5 shrink-0" /> },
            { label: 'Dean Desk', href: '/dashboard/dean', icon: <ShieldAlert className="w-5 h-5 shrink-0" /> },
            { label: 'Notifications', href: '/dashboard/notifications', icon: <Bell className="w-5 h-5 shrink-0" /> },
            { label: 'Settings', href: '/dashboard/settings', icon: <Settings className="w-5 h-5 shrink-0" /> },
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
        '/dashboard': role === 'admin' ? 'Control center and operational insights' : role === 'faculty' ? 'Department operations and circulars' : 'Your university workspace',
        '/dashboard/chat': role === 'admin'
            ? 'Ask admin operations queries: users, audits, docs, and moderation'
            : role === 'faculty'
                ? 'Ask faculty workflow queries: circulars, classes, and department updates'
                : 'Ask student support queries: courses, notices, and deadlines',
        '/dashboard/courses': 'Browse courses, calendars, and syllabus',
        '/dashboard/documents': 'Upload, route, and manage document access',
        '/dashboard/upload': 'Upload, route, and manage document access',
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
        await logout();
        setShowNotifications(false);
        showToast("Signed out successfully", "success");
        navigate('/auth/login', { replace: true });
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
        let active = true;
        const loadTopbarData = async () => {
            if (!token) return;
            try {
                const notificationRes = await authApi.getNotifications(token, 6);
                if (!active) return;
                setNotifications(notificationRes.notifications || []);
            } catch {
                if (!active) return;
                setNotifications([]);
            }
        };
        loadTopbarData();
        return () => {
            active = false;
        };
    }, [token]);

    useEffect(() => {
        if (!showNotifications || !token || unreadCount <= 0) return;
        authApi.markNotificationsRead(token).catch(() => undefined);
        setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })));
    }, [showNotifications, unreadCount, token]);

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

    return (
        <div className="flex min-h-screen w-full bg-[#050507] text-white">
            {/* Sticky Sidebar */}
            <div className="sticky top-0 h-screen shrink-0 z-50 bg-black">
                <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
                    <SidebarBody className="justify-between gap-6 py-2">
                        {/* Top: Logo + Nav */}
                        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
                            {/* Brand Logo - Fixed at top of sidebar, Desktop Only */}
                            <div className="hidden md:flex items-center gap-3 px-3 mb-6 mt-5 h-10 shrink-0">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-white/10">
                                    <BrandLogo className="w-6 h-6 text-black" />
                                </div>
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-xl font-extrabold text-white tracking-tight leading-none"
                                    style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}
                                >
                                    Univ<span className="text-orange-500">GPT</span>
                                </motion.span>
                            </div>

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
            <div className="flex-1 flex flex-col min-w-0 pt-2 lg:pt-0 bg-black">
                <div className="flex-1 flex flex-col min-w-0 bg-black rounded-tl-[32px] overflow-hidden border-l border-t border-white/[0.07] relative">
                    <header className="h-20 flex items-center justify-between px-6 md:px-8 shrink-0 relative z-40 border-b border-white/[0.06] bg-black">
                        <div className="flex items-center gap-4">
                            {/* Mobile Brand Toggle */}
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="md:hidden flex items-center gap-3 shrink-0 active:scale-95 transition-all"
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
                                <button
                                    onClick={() => {
                                        setIsLoadingNotifications(true);
                                        setShowNotifications((prev) => !prev);
                                        setTimeout(() => setIsLoadingNotifications(false), 150);
                                    }}
                                    title="Open notifications"
                                    className="w-9 h-9 flex items-center justify-center text-zinc-500 hover:text-white transition-colors rounded-full hover:bg-white/[0.06] relative"
                                >
                                    <Bell className="w-[18px] h-[18px]" />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full" />
                                    )}
                                </button>

                                <AnimatePresence>
                                    {showNotifications && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 8, scale: 0.96 }}
                                            className="fixed sm:absolute right-4 left-4 sm:left-auto sm:right-0 top-20 sm:top-[calc(100%+0.5rem)] w-80 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[100] origin-top-right"
                                            data-lenis-prevent
                                        >
                                            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                                                <span className="text-sm font-semibold text-white">Notifications</span>
                                                <span className="text-[10px] text-orange-400 font-semibold">{unreadCount} new</span>
                                            </div>
                                            <div
                                                className="max-h-64 overflow-y-auto overflow-x-hidden overscroll-contain"
                                                data-lenis-prevent
                                            >
                                                {!isLoadingNotifications && notifications.length === 0 && (
                                                    <div className="px-4 py-6 text-xs text-zinc-500">
                                                        No notifications yet.
                                                    </div>
                                                )}
                                                {notifications.map((n) => (
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
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowNotifications(false);
                                                    setIsLoadingNotifications(false);
                                                    navigate('/dashboard/notifications');
                                                }}
                                                title="Open full notifications page"
                                                className="w-full px-4 py-3 text-xs text-orange-300 hover:text-orange-200 border-t border-white/[0.06] flex items-center justify-center gap-1.5 bg-black/40 hover:bg-white/[0.03]"
                                            >
                                                View all notifications <ChevronRight className="w-3.5 h-3.5" />
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Profile */}
                            <button
                                onClick={() => navigate('/dashboard/profile')}
                                title="Open profile"
                                className="hover:scale-110 transition-transform"
                            >
                                <ProfileAvatar size="sm" />
                            </button>
                        </div>
                    </header>

                    {/* Native Scrollable Content */}
                    <div className="flex-1 w-full mx-auto relative z-10">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={location.pathname}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="h-full"
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
            </div>
        </div>
    );
}
