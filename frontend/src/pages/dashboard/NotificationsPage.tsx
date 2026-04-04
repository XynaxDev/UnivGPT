/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, RefreshCw, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { authApi, documentsApi, type DocumentPreviewResponse, type UserNotificationItem } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { DocumentPreviewModal } from '@/components/ui/DocumentPreviewModal';

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

const isUuidLike = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export default function NotificationsPage() {
    const { token, user } = useAuthStore();
    const { showToast } = useToastStore();
    const navigate = useNavigate();
    const location = useLocation();
    const role = String(user?.role || 'student').toLowerCase();
    const isAdmin = role === 'admin';
    const cachedNotifications = token ? authApi.peekNotifications(token, 100) : null;
    const [items, setItems] = useState<UserNotificationItem[]>(
        () =>
            (cachedNotifications?.notifications || []).filter((item) => {
                if (isAdmin) return true;
                return !(item.id.startsWith('report:') || item.id.startsWith('appeal'));
            }),
    );
    const [isLoading, setIsLoading] = useState(!cachedNotifications);
    const [isPaginating, setIsPaginating] = useState(false);
    const [focusedNotificationId, setFocusedNotificationId] = useState<string | null>(null);
    const [previewDoc, setPreviewDoc] = useState<DocumentPreviewResponse | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isAttachmentLoading, setIsAttachmentLoading] = useState(false);
    const [previewPendingTitle, setPreviewPendingTitle] = useState('');
    const [previewPendingSubtitle, setPreviewPendingSubtitle] = useState('');
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
            setIsLoading(!cachedNotifications || force);
        }
        try {
            const data = await authApi.getNotifications(token, 100, { force });
            const filtered = (data.notifications || []).filter((item) => {
                if (isAdmin) return true;
                return !(item.id.startsWith('report:') || item.id.startsWith('appeal'));
            });
            setItems(filtered);
        } catch (err: any) {
            showToast(err?.message || 'Failed to load notifications.', 'error');
            setItems([]);
        } finally {
            setIsLoading(false);
            hasLoadedOnceRef.current = true;
        }
    }, [token, showToast, user?.role]);

    useEffect(() => {
        if (cachedNotifications) {
            hasLoadedOnceRef.current = true;
            return;
        }
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

    const goToPage = (nextPage: number) => {
        if (isLoading || isPaginating) return;
        if (nextPage < 1 || nextPage > totalPages) return;
        setIsPaginating(true);
        window.setTimeout(() => {
            setCurrentPage(nextPage);
            setIsPaginating(false);
        }, 140);
    };

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

    const openNotification = async (item: UserNotificationItem) => {
        const role = String(user?.role || 'student').toLowerCase();
        const isAdmin = role === 'admin';
        if (item.id.startsWith('appeal')) {
            if (!isAdmin) {
                showToast('This notice is restricted to admin workflows.', 'error');
                openNotificationInChat(item);
                return;
            }
            navigate('/dashboard/dean');
            return;
        }
        if (item.id.startsWith('report:')) {
            if (!isAdmin) {
                showToast('This notice is restricted to admin workflows.', 'error');
                openNotificationInChat(item);
                return;
            }
            navigate('/dashboard/users');
            return;
        }
        if (!token || !isUuidLike(item.id)) {
            openNotificationInChat(item);
            return;
        }
        setPreviewPendingTitle(item.title);
        setPreviewPendingSubtitle(`${item.course || 'General'} · ${item.department || 'No department'} · notification`);
        setIsPreviewOpen(true);
        setPreviewDoc(null);
        setIsPreviewLoading(true);
        try {
            const doc = await documentsApi.preview(token, item.id);
            setPreviewDoc(doc);
        } catch {
            setIsPreviewOpen(false);
            openNotificationInChat(item);
        } finally {
            setIsPreviewLoading(false);
        }
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
                    {(isLoading || isPaginating) && (
                        <div className="p-4 space-y-3">
                            {Array.from({ length: 5 }).map((_, idx) => (
                                <div key={`notification-skeleton-${idx}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                                    <div className="flex gap-3">
                                        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                                        <div className="flex-1 space-y-2.5">
                                            <Skeleton className="h-4 w-48" />
                                            <Skeleton className="h-3 w-full" />
                                            <Skeleton className="h-3 w-2/3" />
                                            <Skeleton className="h-3 w-36" />
                                        </div>
                                        <Skeleton className="h-8 w-28 rounded-lg shrink-0" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {!isLoading && !isPaginating && items.length === 0 && (
                        <div className="px-5 py-10 text-sm text-zinc-500">No notifications yet.</div>
                    )}
                    {!isLoading && !isPaginating &&
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
                                                onClick={() => openNotification(item)}
                                                className="shrink-0 h-8 px-3 rounded-lg border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.07] text-[11px] font-semibold text-orange-300 hover:text-orange-200 transition-colors"
                                            >
                                                {item.id.startsWith('appeal') || item.id.startsWith('report:')
                                                    ? 'Open Notice'
                                                    : 'Preview Document'}
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
                                onClick={() => goToPage(currentPage - 1)}
                                disabled={currentPage === 1 || isPaginating}
                                className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.02] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] text-xs font-medium"
                            >
                                Prev
                            </button>
                            <button className="h-7 w-7 rounded-lg text-xs font-semibold transition-colors bg-orange-600 text-white">
                                {currentPage}
                            </button>
                            <span className="text-zinc-600">/ {totalPages}</span>
                            <button
                                onClick={() => goToPage(currentPage + 1)}
                                disabled={currentPage === totalPages || isPaginating}
                                className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.02] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] text-xs font-medium"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                <DocumentPreviewModal
                    isOpen={isPreviewOpen}
                    previewDoc={previewDoc}
                    isLoading={isPreviewLoading}
                    pendingTitle={previewPendingTitle}
                    pendingSubtitle={previewPendingSubtitle}
                    onClose={() => {
                        setIsPreviewOpen(false);
                        setPreviewDoc(null);
                        setPreviewPendingTitle('');
                        setPreviewPendingSubtitle('');
                    }}
                    isAttachmentLoading={isAttachmentLoading}
                    onOpenAttachment={
                        previewDoc?.attachment_document_id
                            ? async () => {
                                  if (
                                      !token ||
                                      !previewDoc.attachment_document_id ||
                                      isAttachmentLoading ||
                                      !isUuidLike(previewDoc.attachment_document_id)
                                  ) {
                                      return;
                                  }
                                  setIsAttachmentLoading(true);
                                  try {
                                      const attached = await documentsApi.preview(token, previewDoc.attachment_document_id);
                                      setPreviewDoc(attached);
                                  } catch (err: any) {
                                      showToast(err?.message || 'Attachment preview is not available.', 'error');
                                  } finally {
                                      setIsAttachmentLoading(false);
                                  }
                              }
                            : undefined
                    }
                />
            </div>
        </div>
    );
}


