import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, RefreshCw, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { authApi, type UserNotificationItem } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const formatDate = (value?: string | null) => {
    if (!value) return 'Unknown time';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Unknown time';
    return dt.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export default function NotificationsPage() {
    const { token } = useAuthStore();
    const { showToast } = useToastStore();
    const navigate = useNavigate();
    const location = useLocation();
    const [items, setItems] = useState<UserNotificationItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [focusedNotificationId, setFocusedNotificationId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const hasLoadedOnceRef = useRef(false);
    const ITEMS_PER_PAGE = 8;

    const unread = useMemo(() => items.filter((item) => item.unread).length, [items]);
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
    const paginatedItems = items.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
    );

    const loadNotifications = useCallback(async (force = false) => {
        if (!token) {
            setItems([]);
            setIsLoading(false);
            return;
        }
        if (!hasLoadedOnceRef.current || force) {
            setIsLoading(true);
        }
        try {
            const data = await authApi.getNotifications(token, 30, { force });
            setItems(data.notifications || []);
        } catch (err: any) {
            showToast(err?.message || 'Failed to load notifications.', 'error');
            setItems([]);
        } finally {
            setIsLoading(false);
            hasLoadedOnceRef.current = true;
        }
    }, [token, showToast]);

    useEffect(() => {
        loadNotifications();
    }, [loadNotifications]);

    useEffect(() => {
        if (!token || unread <= 0) return;
        authApi.markNotificationsRead(token).catch(() => undefined);
        setItems((prev) => prev.map((item) => ({ ...item, unread: false })));
    }, [token, unread]);

    useEffect(() => {
        setCurrentPage(1);
    }, [items.length]);

    useEffect(() => {
        const state = location.state as { focusNotificationId?: string } | null;
        const nextId = state?.focusNotificationId || null;
        if (!nextId) return;
        setFocusedNotificationId(nextId);
        const itemIndex = items.findIndex((item) => item.id === nextId);
        if (itemIndex >= 0) {
            setCurrentPage(Math.floor(itemIndex / ITEMS_PER_PAGE) + 1);
        }

        const timer = window.setTimeout(() => {
            setFocusedNotificationId(null);
            navigate(location.pathname, { replace: true, state: {} });
        }, 2800);

        return () => window.clearTimeout(timer);
    }, [location.pathname, location.state, navigate, items]);

    useEffect(() => {
        if (!focusedNotificationId || items.length === 0) return;
        const el = document.querySelector(`[data-notification-id="${focusedNotificationId}"]`);
        if (el instanceof HTMLElement) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [focusedNotificationId, items]);

    const openNotificationInChat = (item: UserNotificationItem) => {
        const scope = [item.course, item.department].filter(Boolean).join(' / ');
        const prefill = scope
            ? `Summarize this notification and next steps: ${item.title}. Scope: ${scope}.`
            : `Summarize this notification and next steps: ${item.title}.`;
        navigate('/dashboard/chat', { state: { prefill } });
    };

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-7xl mx-auto p-6 md:p-8 pb-24 space-y-6">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/95 via-zinc-900/80 to-black p-5 md:p-6"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                                <Bell className="w-6 h-6 text-orange-400" /> Notifications
                            </h1>
                            <p className="text-zinc-500 text-sm mt-1">
                                Document updates relevant to your role, course, and department.
                            </p>
                        </div>
                        <button
                            onClick={() => loadNotifications(true)}
                            className="h-10 px-4 rounded-xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.06] text-sm text-white inline-flex items-center gap-2"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>
                </motion.div>

                <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/35 overflow-hidden">
                    {isLoading && (
                        <div className="px-5 py-8 text-sm text-zinc-500">Loading notifications...</div>
                    )}
                    {!isLoading && items.length === 0 && (
                        <div className="px-5 py-10 text-sm text-zinc-500">No notifications yet.</div>
                    )}
                    {!isLoading &&
                        paginatedItems.map((item) => (
                            <div
                                key={item.id}
                                data-notification-id={item.id}
                                className={cn(
                                    "px-5 py-4 border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.03] transition-colors",
                                    focusedNotificationId === item.id && "bg-orange-500/[0.08] border-orange-500/30"
                                )}
                            >
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mt-0.5">
                                        <FileText className="w-4 h-4 text-orange-300" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0 flex items-center gap-2">
                                                <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                                                {item.unread && <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => openNotificationInChat(item)}
                                                className="shrink-0 h-8 px-3 rounded-lg border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.07] text-[11px] font-semibold text-orange-300 hover:text-orange-200 transition-colors"
                                            >
                                                View Notification
                                            </button>
                                        </div>
                                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed break-words">{item.message}</p>
                                        <div className="flex flex-wrap items-center gap-3 mt-2">
                                            {item.course && (
                                                <span className="text-[11px] text-zinc-500">Course: {item.course}</span>
                                            )}
                                            {item.department && (
                                                <span className="text-[11px] text-zinc-500">Department: {item.department}</span>
                                            )}
                                            <span className="text-[11px] text-zinc-600">{formatDate(item.uploaded_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>

                {!isLoading && items.length > 0 && (
                    <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-500">
                        <span>
                            Showing{' '}
                            <span className="text-zinc-300">
                                {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                                {'-'}
                                {Math.min(currentPage * ITEMS_PER_PAGE, items.length)}
                            </span>{' '}
                            of <span className="text-zinc-300">{items.length}</span> notifications
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.02] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] text-xs font-medium"
                            >
                                Prev
                            </button>
                            {Array.from({ length: totalPages }).map((_, idx) => {
                                const page = idx + 1;
                                const active = page === currentPage;
                                return (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-colors ${
                                            active
                                                ? 'bg-orange-600 text-white'
                                                : 'border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.08]'
                                        }`}
                                    >
                                        {page}
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.02] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] text-xs font-medium"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
