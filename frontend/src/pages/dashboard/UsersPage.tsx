/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Search, Edit2, X, Check, RefreshCcw, Megaphone, BarChart3, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HoverTooltip } from '@/components/ui/tooltip';
import { adminApi, type UserProfile, type UserActivityReportNoticeResponse, type UserActivityReportPreviewResponse } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { useNavigate } from 'react-router-dom';

type RoleType = 'student' | 'faculty' | 'admin';

const roleColors: Record<RoleType, string> = {
    student: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    faculty: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    admin: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

const formatJoined = (value?: string) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString();
};

const formatDateTime = (value?: string | null) => {
    if (!value) return 'No recent activity';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No recent activity';
    return date.toLocaleString();
};

const roleValue = (value?: string | null): RoleType => {
    const lowered = String(value || '').trim().toLowerCase();
    if (lowered === 'faculty' || lowered === 'admin') return lowered;
    return 'student';
};

const statusFromProfile = (profile: UserProfile): 'active' | 'inactive' => {
    const email = (profile.email || '').toLowerCase();
    return email ? 'active' : 'inactive';
};

const UsersPage = () => {
    const { token, user } = useAuthStore();
    const { showToast } = useToastStore();
    const navigate = useNavigate();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isPaginating, setIsPaginating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [isPreviewingReport, setIsPreviewingReport] = useState(false);
    const [reportSubject, setReportSubject] = useState('UnivGPT User Activity Report Notice');
    const [reportMessage, setReportMessage] = useState('Please review your activity summary and continue responsible usage of UnivGPT.');
    const [reportResult, setReportResult] = useState<UserActivityReportNoticeResponse | null>(null);
    const [reportPreview, setReportPreview] = useState<UserActivityReportPreviewResponse | null>(null);

    const [formName, setFormName] = useState('');
    const [formRole, setFormRole] = useState<RoleType>('student');
    const [formDept, setFormDept] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const loadUsers = async (silent = false) => {
        if (!token) return;
        if ((user?.role || '').toLowerCase() !== 'admin') return;
        if (!silent) setIsLoading(true);
        try {
            const res = await adminApi.getUsers(token, 1, 100);
            setUsers(res.users || []);
        } catch (err: any) {
            showToast(err?.message || 'Failed to load users from database.', 'error');
            setUsers([]);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        if ((user?.role || '').toLowerCase() !== 'admin') {
            navigate('/dashboard', { replace: true });
            return;
        }
        if ((user?.role || '').toLowerCase() !== 'admin') return;
        const cachedUsers = token ? adminApi.peekUsers(token, 1, 100) : null;
        if (cachedUsers?.users?.length) {
            setUsers(cachedUsers.users);
            setIsLoading(false);
        }
        loadUsers(Boolean(cachedUsers?.users?.length));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, user?.role, navigate]);

    if ((user?.role || '').toLowerCase() !== 'admin') {
        return (
            <div className="h-full overflow-y-auto p-5 md:p-8">
                <div className="max-w-4xl mx-auto rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 text-sm text-zinc-400">
                    Admin access required.
                </div>
            </div>
        );
    }

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return users;
        return users.filter((user) => {
            const fullName = (user.full_name || '').toLowerCase();
            const email = (user.email || '').toLowerCase();
            const role = roleValue(user.role).toLowerCase();
            const dept = (user.department || '').toLowerCase();
            return (
                fullName.includes(q) ||
                email.includes(q) ||
                role.includes(q) ||
                dept.includes(q)
            );
        });
    }, [searchQuery, users]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, users.length]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paginatedUsers = filtered.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
    );

    const goToPage = (nextPage: number) => {
        if (isLoading || isPaginating) return;
        if (nextPage < 1 || nextPage > totalPages) return;
        setIsPaginating(true);
        window.setTimeout(() => {
            setCurrentPage(nextPage);
            setIsPaginating(false);
        }, 140);
    };

    const stats = useMemo(() => {
        const base = users;
        return [
            { label: 'Total Users', value: base.length, color: 'text-white' },
            { label: 'Students', value: base.filter((u) => roleValue(u.role) === 'student').length, color: 'text-blue-400' },
            { label: 'Faculty', value: base.filter((u) => roleValue(u.role) === 'faculty').length, color: 'text-amber-400' },
            { label: 'Active', value: base.filter((u) => statusFromProfile(u) === 'active').length, color: 'text-emerald-400' },
        ];
    }, [users]);

    const openEditModal = (user: UserProfile) => {
        setEditingUser(user);
        setFormName(user.full_name || '');
        setFormRole(roleValue(user.role));
        setFormDept(user.department || '');
        setShowEditModal(true);
    };

    const handleSave = async () => {
        if (!token || !editingUser) return;
        if (!formName.trim()) {
            showToast('Full name is required.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const updated = await adminApi.updateUser(token, editingUser.id, {
                full_name: formName.trim(),
                role: formRole,
                department: formDept.trim() || undefined,
            });
            setUsers((prev) =>
                prev.map((user) => (user.id === editingUser.id ? { ...user, ...updated.user } : user)),
            );
            setShowEditModal(false);
            setEditingUser(null);
            showToast('User updated successfully.', 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to update user.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateNotice = async () => {
        if (!token) return;
        setIsGeneratingReport(true);
        try {
            const res = await adminApi.createUserActivityReportNotice(token, {
                subject: reportSubject.trim() || undefined,
                message: reportMessage.trim() || undefined,
                include_zero_query_users: true,
                max_recipients: 500,
            });
            setReportResult(res);
            showToast(
                `Report sent to ${res.recipients_sent} users${res.recipients_failed ? ` (${res.recipients_failed} failed)` : ''}.`,
                res.recipients_failed ? undefined : 'success',
            );
        } catch (err: any) {
            showToast(err?.message || 'Failed to generate user activity report notice.', 'error');
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const handlePreviewRecipients = async () => {
        if (!token) return;
        setIsPreviewingReport(true);
        try {
            const res = await adminApi.previewUserActivityReportNotice(token, {
                subject: reportSubject.trim() || undefined,
                message: reportMessage.trim() || undefined,
                include_zero_query_users: true,
                max_recipients: 500,
            });
            setReportPreview(res);
            showToast(`Preview loaded for ${res.recipients_total} recipients.`, 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to preview recipients.', 'error');
        } finally {
            setIsPreviewingReport(false);
        }
    };

    return (
        <div className="h-full overflow-y-auto p-5 md:p-8 space-y-6 max-w-7xl mx-auto pb-20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-orange-500/20 bg-gradient-to-r from-[#201108] via-[#161117] to-[#0b1226] p-5">
                <div>
                    <div className="inline-flex items-center rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-[10px] tracking-[0.18em] uppercase font-bold text-orange-300 mb-2">
                        Admin User Desk
                    </div>
                    <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-orange-400" /> User Management
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">
                        {isLoading ? 'Syncing users...' : `${filtered.length} users found`}
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <div className="relative group/search">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 group-focus-within/search:text-orange-400 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-10 w-full sm:w-64 pl-9 pr-4 rounded-xl border border-white/[0.08] bg-white/[0.03] focus:border-orange-500/30 focus:bg-white/[0.05] outline-none text-xs placeholder:text-zinc-700 transition-all font-medium"
                        />
                    </div>
                    <Button
                        onClick={() => loadUsers()}
                        className="h-10 rounded-xl bg-orange-600 hover:bg-orange-500 text-xs font-bold px-5 transition-all hover:shadow-lg hover:shadow-orange-500/20 active:scale-95 text-white"
                        disabled={isLoading}
                        title="Reload users from database."
                    >
                        <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {stats.map((stat) => (
                    <div key={stat.label} className="p-3 sm:p-4 rounded-xl bg-zinc-900/50 border border-white/[0.06] text-center transition-all">
                        <div className={`text-lg sm:text-xl font-extrabold ${stat.color}`}>{stat.value}</div>
                        <div className="text-[9px] sm:text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{stat.label}</div>
                    </div>
                ))}
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/70 to-zinc-900/35 p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">
                            <Megaphone className="w-3.5 h-3.5" /> Report Notice Broadcast
                        </div>
                        <p className="text-xs text-zinc-400 mt-2">
                            Generate a user activity report from live query logs and send a dynamic notice email to all users.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto sm:min-w-0">
                        <Button
                            onClick={handlePreviewRecipients}
                            disabled={isPreviewingReport}
                            variant="outline"
                            className="h-10 rounded-xl border-white/15 bg-white/[0.03] hover:bg-white/[0.07] text-xs font-bold px-4 text-white w-full whitespace-nowrap"
                        >
                            <Eye className="w-4 h-4 mr-2" />
                            {isPreviewingReport ? 'Previewing...' : 'Preview Recipients'}
                        </Button>
                        <Button
                            onClick={handleGenerateNotice}
                            disabled={isGeneratingReport}
                            className="h-10 rounded-xl bg-orange-600 hover:bg-orange-500 text-xs font-bold px-5 transition-all hover:shadow-lg hover:shadow-orange-500/20 active:scale-95 text-white w-full whitespace-nowrap"
                        >
                            <BarChart3 className="w-4 h-4 mr-2" />
                            {isGeneratingReport ? 'Generating...' : 'Generate & Send'}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1.5">
                            Email Subject
                        </label>
                        <input
                            value={reportSubject}
                            onChange={(e) => setReportSubject(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs outline-none focus:border-orange-500/30"
                            placeholder="UnivGPT User Activity Report Notice"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1.5">
                            Notice Message
                        </label>
                        <input
                            value={reportMessage}
                            onChange={(e) => setReportMessage(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs outline-none focus:border-orange-500/30"
                            placeholder="Please review your activity summary..."
                        />
                    </div>
                </div>

                {reportResult && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        <div className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Recipients</div>
                            <div className="text-sm font-bold text-white">{reportResult.recipients_sent}</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Failures</div>
                            <div className="text-sm font-bold text-red-300">{reportResult.recipients_failed}</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Queries</div>
                            <div className="text-sm font-bold text-orange-300">{reportResult.stats.total_queries}</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Active Users</div>
                            <div className="text-sm font-bold text-emerald-300">{reportResult.stats.active_users}</div>
                        </div>
                    </div>
                )}

                {reportPreview && (
                    <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <p className="text-xs font-semibold text-white">Recipient Preview</p>
                                <p className="text-[11px] text-zinc-500">
                                    {reportPreview.recipients_total} total recipients - showing first {reportPreview.preview_recipients.length}
                                </p>
                            </div>
                            <div className="text-[11px] text-zinc-500">
                                Duplicates skipped: <span className="text-zinc-300 font-semibold">{reportPreview.duplicate_rows_skipped}</span>
                            </div>
                        </div>
                        <div
                            className="max-h-[24rem] overflow-y-auto overscroll-y-contain pr-1 space-y-2 rounded-lg border border-white/[0.05] bg-black/25 p-2 scrollbar-thin scrollbar-thumb-white/10"
                            onWheel={(e) => e.stopPropagation()}
                        >
                            {reportPreview.preview_recipients.map((recipient) => (
                                <div
                                    key={recipient.id}
                                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-zinc-200 truncate">{recipient.full_name}</p>
                                            <p className="text-[11px] text-zinc-500 truncate">{recipient.email}</p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-[10px] uppercase tracking-wider text-zinc-500">{recipient.role}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-1.5">
                                        <div className="rounded-md border border-white/[0.07] bg-black/30 px-2 py-1">
                                            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Queries</p>
                                            <p className="text-xs font-semibold text-orange-300">{recipient.query_count}</p>
                                        </div>
                                        <div className="rounded-md border border-white/[0.07] bg-black/30 px-2 py-1">
                                            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Active Days (30d)</p>
                                            <p className="text-xs font-semibold text-emerald-300">{recipient.active_days_30}</p>
                                        </div>
                                        <div className="rounded-md border border-white/[0.07] bg-black/30 px-2 py-1">
                                            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Account Age</p>
                                            <p className="text-xs font-semibold text-sky-300">{recipient.account_age_days}d</p>
                                        </div>
                                        <div className="rounded-md border border-white/[0.07] bg-black/30 px-2 py-1">
                                            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Last Query</p>
                                            <p className="text-[11px] font-medium text-zinc-300 truncate">{formatDateTime(recipient.last_query_at)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 border border-white/[0.08] overflow-hidden">
                <div className="hidden sm:grid grid-cols-[1fr_1fr_80px_80px_90px_70px] gap-3 px-5 py-3 border-b border-white/[0.06] text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                    <span>User</span>
                    <span>Department</span>
                    <span>Role</span>
                    <span>Status</span>
                    <span>Joined</span>
                    <span>Actions</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                    {(isLoading || isPaginating) && (
                        <div className="px-5 py-4 space-y-3">
                            {Array.from({ length: 6 }).map((_, idx) => (
                                <div key={`users-skeleton-${idx}`} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_80px_80px_90px_70px] gap-2 sm:gap-3 items-center py-2.5">
                                    <div className="flex items-center gap-3">
                                        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                                        <div className="space-y-1.5 min-w-0 flex-1">
                                            <Skeleton className="h-3.5 w-28" />
                                            <Skeleton className="h-3 w-40" />
                                        </div>
                                    </div>
                                    <Skeleton className="h-3.5 w-24" />
                                    <Skeleton className="h-5 w-14 rounded-full" />
                                    <Skeleton className="h-3.5 w-16" />
                                    <Skeleton className="h-3.5 w-20" />
                                    <Skeleton className="h-7 w-7 rounded-md" />
                                </div>
                            ))}
                        </div>
                    )}
                    {!isLoading && !isPaginating && filtered.length === 0 && (
                        <div className="px-5 py-10 text-sm text-zinc-500">No users found in the database.</div>
                    )}
                    {!isLoading && !isPaginating && paginatedUsers.map((user, idx) => {
                        const role = roleValue(user.role);
                        const status = statusFromProfile(user);
                        const avatar =
                            ((user as any).avatar_url as string | null | undefined) ||
                            ((user as any).profileImage as string | null | undefined) ||
                            ((user as any).profile_image as string | null | undefined) ||
                            ((user as any).profile_picture as string | null | undefined) ||
                            ((user as any).avatar as string | null | undefined) ||
                            null;
                        return (
                            <motion.div
                                key={user.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: idx * 0.02 }}
                                className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_80px_80px_90px_70px] gap-2 sm:gap-3 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors"
                            >
                                <div className="sm:hidden rounded-xl border border-white/[0.06] bg-black/30 p-3 space-y-2.5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center shrink-0">
                                                {avatar ? (
                                                    <img
                                                        src={avatar}
                                                        alt="User avatar"
                                                        className="w-full h-full rounded-full object-cover"
                                                    />
                                                ) : (
                                                    <span className="text-[10px] font-bold text-orange-400">
                                                        {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs font-medium text-white truncate">{user.full_name || 'User'}</div>
                                                <div className="text-[10px] text-zinc-600 truncate">{user.email || 'No email'}</div>
                                            </div>
                                        </div>
                                        <HoverTooltip content="Edit user">
                                            <button
                                                onClick={() => openEditModal(user)}
                                                className="w-8 h-8 rounded-lg border border-white/10 hover:border-orange-500/40 hover:bg-white/5 flex items-center justify-center text-zinc-500 hover:text-orange-400 transition-colors shrink-0"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                        </HoverTooltip>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="text-[10px] text-zinc-500">
                                            Department
                                            <div className="text-zinc-300 mt-0.5 truncate">{user.department || 'Not set'}</div>
                                        </div>
                                        <div className="text-[10px] text-zinc-500">
                                            Joined
                                            <div className="text-zinc-300 mt-0.5">{formatJoined(user.created_at)}</div>
                                        </div>
                                        <div className="text-[10px] text-zinc-500">
                                            Role
                                            <div className="mt-1">
                                                <Badge className={`text-[9px] font-semibold px-2 py-0.5 border capitalize w-fit ${roleColors[role]}`}>
                                                    {role}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-zinc-500">
                                            Status
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <div className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                                                <span className="text-[10px] text-zinc-300 capitalize">{status}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="hidden sm:flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center shrink-0">
                                        {avatar ? (
                                            <img
                                                src={avatar}
                                                alt="User avatar"
                                                className="w-full h-full rounded-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-[10px] font-bold text-orange-400">
                                                {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-xs font-medium text-white truncate">{user.full_name || 'User'}</div>
                                        <div className="text-[10px] text-zinc-600 truncate">{user.email || 'No email'}</div>
                                    </div>
                                </div>
                                <span className="hidden sm:inline text-xs text-zinc-400 truncate">{user.department || 'Not set'}</span>
                                <Badge className={`hidden sm:inline-flex text-[9px] font-semibold px-2 py-0.5 border capitalize w-fit ${roleColors[role]}`}>
                                    {role}
                                </Badge>
                                <div className="hidden sm:flex items-center gap-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                                    <span className="text-[10px] text-zinc-500 capitalize">{status}</span>
                                </div>
                                <span className="hidden sm:inline text-[10px] text-zinc-600">{formatJoined(user.created_at)}</span>
                                <div className="hidden sm:flex items-center gap-1">
                                    <HoverTooltip content="Edit user">
                                        <button
                                            onClick={() => openEditModal(user)}
                                            className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center text-zinc-600 hover:text-orange-400 transition-colors"
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </button>
                                    </HoverTooltip>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {filtered.length > 0 && (
                <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-500">
                    <span>
                        Showing{' '}
                        <span className="text-zinc-300">
                            {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                            {'-'}
                            {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}
                        </span>{' '}
                        of <span className="text-zinc-300">{filtered.length}</span> users
                    </span>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1 || isPaginating}
                            className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.02] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] text-xs font-medium"
                        >
                            Prev
                        </button>
                        <HoverTooltip content="Current page">
                            <button
                                className="h-7 w-7 rounded-lg text-xs font-semibold transition-colors bg-orange-600 text-white"
                            >
                                {currentPage}
                            </button>
                        </HoverTooltip>
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

            <AnimatePresence>
                {showEditModal && editingUser && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setShowEditModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl p-6 space-y-4"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-white">Edit User</h3>
                                <button onClick={() => setShowEditModal(false)} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-zinc-500">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium block mb-1">Full Name</label>
                                    <input
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        className="w-full h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs outline-none focus:border-orange-500/30"
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium block mb-1">Role</label>
                                    <div className="flex gap-2">
                                        {(['student', 'faculty', 'admin'] as const).map((role) => (
                                            <button
                                                key={role}
                                                onClick={() => setFormRole(role)}
                                                className={`flex-1 h-9 rounded-lg text-xs font-semibold capitalize border transition-all ${
                                                    formRole === role
                                                        ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                                        : 'bg-white/[0.02] text-zinc-500 border-white/[0.06] hover:border-white/[0.12]'
                                                }`}
                                            >
                                                {role}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium block mb-1">Department</label>
                                    <input
                                        value={formDept}
                                        onChange={(e) => setFormDept(e.target.value)}
                                        className="w-full h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs outline-none focus:border-orange-500/30"
                                        placeholder="Computer Science"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button
                                    onClick={() => setShowEditModal(false)}
                                    variant="glass"
                                    className="flex-1 h-9 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white transition-all active:scale-95"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSave}
                                    className="flex-1 h-9 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-500 transition-all hover:shadow-lg hover:shadow-orange-500/20 active:scale-95"
                                    disabled={isSaving}
                                >
                                    <Check className="w-3 h-3 mr-1" /> {isSaving ? 'Saving...' : 'Update'}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default UsersPage;


