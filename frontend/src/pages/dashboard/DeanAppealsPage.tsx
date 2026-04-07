/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { adminApi, type DeanAppealItem } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToastStore } from '@/store/toastStore';

type AppealFilter = 'pending' | 'approved' | 'rejected' | 'all';

export default function DeanAppealsPage() {
    const { token, user } = useAuthStore();
    const { showToast } = useToastStore();
    const [filter, setFilter] = useState<AppealFilter>('pending');
    const [appeals, setAppeals] = useState<DeanAppealItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [isPaginating, setIsPaginating] = useState(false);
    const [actingUserId, setActingUserId] = useState<string | null>(null);
    const [actingAction, setActingAction] = useState<'approve' | 'reject' | 'reset' | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 6;

    const loadAppeals = async (silent = false) => {
        if (!token) return;
        if ((user?.role || '').toLowerCase() !== 'admin') return;
        const startedAt = Date.now();
        try {
            if (!silent) setLoading(true);
            const res = await adminApi.getDeanAppeals(token, filter, 200);
            setAppeals(res.appeals || []);
        } catch (err) {
            showToast((err as Error)?.message || 'Failed to load appeals.', 'error');
        } finally {
            const elapsed = Date.now() - startedAt;
            const remaining = Math.max(0, 220 - elapsed);
            if (!silent) {
                window.setTimeout(() => setLoading(false), remaining);
            }
        }
    };

    useEffect(() => {
        if ((user?.role || '').toLowerCase() !== 'admin') return;
        const cachedAppeals = token ? adminApi.peekDeanAppeals(token, filter, 200) : null;
        if (cachedAppeals?.appeals?.length) {
            setAppeals(cachedAppeals.appeals);
            setLoading(false);
        }
        loadAppeals(Boolean(cachedAppeals?.appeals?.length));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, filter, user?.role]);

    if ((user?.role || '').toLowerCase() !== 'admin') {
        return (
            <div className="h-full overflow-y-auto px-4 sm:px-8 py-5 sm:py-8">
                <div className="max-w-5xl mx-auto rounded-2xl border border-white/10 bg-zinc-900/50 p-6 text-sm text-zinc-400">
                    Admin access required.
                </div>
            </div>
        );
    }

    useEffect(() => {
        setCurrentPage(1);
    }, [filter, appeals.length]);

    const pendingCount = useMemo(
        () => appeals.filter((item) => (item.appeal?.status || '').toLowerCase() === 'pending').length,
        [appeals],
    );
    const totalPages = Math.max(1, Math.ceil(appeals.length / ITEMS_PER_PAGE));
    const paginatedAppeals = useMemo(
        () =>
            appeals.slice(
                (currentPage - 1) * ITEMS_PER_PAGE,
                currentPage * ITEMS_PER_PAGE,
            ),
        [appeals, currentPage],
    );

    const goToPage = (nextPage: number) => {
        if (loading || isPaginating) return;
        if (nextPage < 1 || nextPage > totalPages) return;
        setIsPaginating(true);
        window.setTimeout(() => {
            setCurrentPage(nextPage);
            setIsPaginating(false);
        }, 140);
    };

    const runAction = async (userId: string, action: 'approve' | 'reject' | 'reset') => {
        if (!token) return;
        try {
            setActingUserId(userId);
            setActingAction(action);
            if (action === 'approve') {
                await adminApi.approveDeanAppeal(token, userId, 'Approved by dean review.');
                showToast('Appeal approved and user was notified.', 'success');
            } else if (action === 'reject') {
                await adminApi.rejectDeanAppeal(token, userId, 'Rejected by dean review.');
                showToast('Appeal rejected and user was notified.', 'info');
            } else {
                await adminApi.resetUserFlags(token, userId, 'Manual dean reset.');
                showToast('User flags reset successfully.', 'success');
            }
            await loadAppeals();
        } catch (err) {
            showToast((err as Error)?.message || 'Action failed.', 'error');
        } finally {
            setActingUserId(null);
            setActingAction(null);
        }
    };

    return (
        <div className="h-full overflow-y-auto px-4 sm:px-8 py-5 sm:py-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-orange-500/8 via-red-500/8 to-zinc-900/80 px-6 py-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-orange-300 font-semibold mb-2">
                                <ShieldAlert className="w-4 h-4" />
                                Dean Moderation Desk
                            </div>
                            <h1 className="text-2xl font-extrabold text-white">Appeal Review Queue</h1>
                            <p className="text-sm text-zinc-400 mt-1">
                                Review apology appeals, approve or reject requests, and reset user flags when required.
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="border-white/15 bg-white/5 hover:bg-white/10 text-white"
                            onClick={() => loadAppeals()}
                        >
                            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                        </Button>
                    </div>
                    <div className="mt-4 text-xs text-zinc-300">
                        Pending appeals: <span className="text-orange-300 font-semibold">{pendingCount}</span>
                    </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                    {(['pending', 'approved', 'rejected', 'all'] as AppealFilter[]).map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => setFilter(item)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                                filter === item
                                    ? 'border-orange-400/60 bg-orange-500/15 text-orange-200'
                                    : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                            {item.toUpperCase()}
                        </button>
                    ))}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
                    {(loading || isPaginating) ? (
                        <div className="px-6 py-6 space-y-4">
                            {Array.from({ length: 4 }).map((_, idx) => (
                                <div key={`appeal-skeleton-${idx}`} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-2">
                                            <Skeleton className="h-4 w-48" />
                                            <Skeleton className="h-3 w-64" />
                                        </div>
                                        <Skeleton className="h-6 w-20 rounded-full" />
                                    </div>
                                    <Skeleton className="h-20 w-full rounded-xl" />
                                    <div className="flex gap-2">
                                        <Skeleton className="h-8 w-28 rounded-lg" />
                                        <Skeleton className="h-8 w-20 rounded-lg" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : appeals.length === 0 ? (
                        <div className="px-6 py-10 text-sm text-zinc-500">No appeals found for this filter.</div>
                    ) : (
                        <div className="divide-y divide-white/10">
                            {paginatedAppeals.map((item) => {
                                const status = (item.appeal?.status || 'none').toLowerCase();
                                return (
                                    <div key={item.user_id} className="px-5 py-4">
                                        <div className="flex items-start justify-between gap-4 flex-wrap">
                                            <div className="space-y-1">
                                                <div className="text-sm font-semibold text-white">
                                                    {item.full_name || 'Unknown user'} <span className="text-zinc-500">({item.role || 'user'})</span>
                                                </div>
                                                <div className="text-xs text-zinc-400">{item.email || 'No email'} - {item.department || 'No department'}</div>
                                                <div className="text-xs text-zinc-500">
                                                    Offense total: <span className="text-zinc-300">{item.offense_total}</span> - Blocked: <span className="text-zinc-300">{item.blocked ? 'Yes' : 'No'}</span>
                                                </div>
                                            </div>
                                            <div className="text-xs px-2.5 py-1 rounded-full border border-white/15 bg-white/5 text-zinc-300">
                                                {status.toUpperCase()}
                                            </div>
                                        </div>
                                        {item.appeal?.message && (
                                            <div className="mt-3 rounded-xl border border-white/10 bg-zinc-900/50 p-3">
                                                <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Apology message</div>
                                                <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                                                    {item.appeal.message}
                                                </p>
                                            </div>
                                        )}
                                        {item.offensive_messages?.length > 0 && (
                                            <div className="mt-3 rounded-xl border border-red-400/15 bg-red-500/[0.04] p-3 text-xs text-zinc-300">
                                                <div className="inline-flex items-center gap-1 text-red-300 mb-2">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Flagged history ({item.offensive_messages.length})
                                                </div>
                                                <ul className="list-disc pl-4 space-y-1">
                                                    {item.offensive_messages.slice(0, 5).map((msg, idx) => (
                                                        <li key={`${item.user_id}-${idx}`} className="text-zinc-300">{msg}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {status === 'pending' ? (
                                                <>
                                                    <Button
                                                        type="button"
                                                        className="h-8 text-xs bg-green-600 hover:bg-green-500"
                                                        disabled={actingUserId === item.user_id}
                                                        onClick={() => runAction(item.user_id, 'approve')}
                                                    >
                                                        {actingUserId === item.user_id && actingAction === 'approve' ? (
                                                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                        ) : (
                                                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                                        )} Approve Appeal
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="h-8 text-xs border-red-400/30 text-red-200 hover:bg-red-500/15"
                                                        disabled={actingUserId === item.user_id}
                                                        onClick={() => runAction(item.user_id, 'reject')}
                                                    >
                                                        {actingUserId === item.user_id && actingAction === 'reject' ? (
                                                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                        ) : (
                                                            <XCircle className="w-3.5 h-3.5 mr-1.5" />
                                                        )} Reject
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className={`h-8 text-xs ${
                                                        status === 'approved'
                                                            ? 'border-green-400/30 text-green-200 bg-green-500/10'
                                                            : 'border-red-400/30 text-red-200 bg-red-500/10'
                                                    }`}
                                                    disabled
                                                >
                                                    {status === 'approved' ? (
                                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                                    ) : (
                                                        <XCircle className="w-3.5 h-3.5 mr-1.5" />
                                                    )}
                                                    {status === 'approved' ? 'Approved' : 'Rejected'}
                                                </Button>
                                            )}
                                            {(status === 'approved' || status === 'rejected') && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-8 text-xs border-orange-300/30 text-orange-100 hover:bg-orange-500/10"
                                                    disabled={actingUserId === item.user_id}
                                                    onClick={() => runAction(item.user_id, 'reset')}
                                                >
                                                    {actingUserId === item.user_id && actingAction === 'reset' ? (
                                                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                    ) : null}
                                                    Force Reset Flags
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {!loading && appeals.length > 0 && (
                    <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-500">
                        <span>
                            Showing{' '}
                            <span className="text-zinc-300">
                                {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                                {'-'}
                                {Math.min(currentPage * ITEMS_PER_PAGE, appeals.length)}
                            </span>{' '}
                            of <span className="text-zinc-300">{appeals.length}</span> appeals
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => goToPage(currentPage - 1)}
                                disabled={currentPage === 1 || loading || isPaginating}
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
                                disabled={currentPage === totalPages || loading || isPaginating}
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


