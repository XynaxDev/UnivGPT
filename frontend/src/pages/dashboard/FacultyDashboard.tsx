/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    CalendarDays,
    Sparkles,
    Bell,
    FileText,
    Clock3,
    BookOpen,
    Building2,
    ArrowRight,
    Activity,
    Megaphone,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, documentsApi, type DocumentResponse, type UserExportData } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

type TimetableSlot = {
    day: string;
    start: string;
    end: string;
    course: string;
    room: string;
    type: string;
};

const WEEKLY_TIMETABLE: TimetableSlot[] = [
    { day: 'Mon', start: '09:00', end: '10:00', course: 'CS301 Data Structures', room: 'Room RL-301', type: 'Lecture' },
    { day: 'Mon', start: '14:00', end: '15:00', course: 'AI405 Applied ML', room: 'Lab ML-2', type: 'Lab' },
    { day: 'Tue', start: '11:00', end: '12:00', course: 'CS402 DBMS', room: 'Room RL-204', type: 'Lecture' },
    { day: 'Wed', start: '10:00', end: '11:00', course: 'CS301 Data Structures', room: 'Room RL-301', type: 'Tutorial' },
    { day: 'Thu', start: '13:00', end: '14:00', course: 'AI405 Applied ML', room: 'Lab ML-2', type: 'Lab' },
    { day: 'Fri', start: '12:00', end: '13:00', course: 'CS402 DBMS', room: 'Room RL-204', type: 'Lecture' },
];

const toMinutes = (value: string) => {
    const [h, m] = value.split(':').map((v) => Number(v));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return h * 60 + m;
};

const toRelativeTime = (value?: string) => {
    if (!value) return 'recently';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'recently';
    const mins = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
};

const normalizeDisplayName = (fullName?: string | null) => {
    const raw = String(fullName || '').trim();
    if (!raw) return 'Faculty';
    const stripped = raw.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').trim();
    if (!stripped) return 'Faculty';
    return stripped;
};

const isNoticeLike = (doc: DocumentResponse) => {
    const name = (doc.filename || '').toLowerCase();
    const tags = (doc.tags || []).map((tag) => tag.toLowerCase());
    return (
        name.includes('notice') ||
        name.includes('announcement') ||
        name.includes('circular') ||
        tags.includes('notice') ||
        tags.includes('announcement') ||
        tags.includes('circular')
    );
};

export default function FacultyDashboard() {
    const { user, token } = useAuthStore();
    const navigate = useNavigate();
    const displayName = normalizeDisplayName(user?.full_name);
    const cachedExport = token ? authApi.peekExportUserData(token) : null;
    const cachedDocs = token ? documentsApi.peekList(token, { page: 1, per_page: 60 }) : null;

    const [isLoading, setIsLoading] = useState(!(cachedExport || cachedDocs));
    const [exportData, setExportData] = useState<UserExportData | null>(cachedExport ?? null);
    const [documents, setDocuments] = useState<DocumentResponse[]>(cachedDocs?.documents || []);

    useEffect(() => {
        let alive = true;
        const loadData = async () => {
            if (!token) return;
            const shouldShowLoading = !(cachedExport || cachedDocs);
            if (shouldShowLoading) setIsLoading(true);
            try {
                const [exportPayload, docsPayload] = await Promise.all([
                    authApi.exportUserData(token),
                    documentsApi.list(token, { page: 1, per_page: 60 }),
                ]);
                if (!alive) return;
                setExportData(exportPayload);
                setDocuments(docsPayload.documents || []);
            } catch {
                if (!alive) return;
                setExportData(null);
                setDocuments([]);
            } finally {
                if (alive) setIsLoading(false);
            }
        };

        loadData();
        return () => {
            alive = false;
        };
    }, [token]);

    const noticeDocs = useMemo(() => {
        return documents
            .filter(isNoticeLike)
            .sort((a, b) => {
                const da = new Date(a.uploaded_at || a.created_at || '').getTime() || 0;
                const db = new Date(b.uploaded_at || b.created_at || '').getTime() || 0;
                return db - da;
            })
            .slice(0, 5);
    }, [documents]);

    const scopedDocs = useMemo(() => {
        return [...documents]
            .sort((a, b) => {
                const da = new Date(a.uploaded_at || a.created_at || '').getTime() || 0;
                const db = new Date(b.uploaded_at || b.created_at || '').getTime() || 0;
                return db - da;
            })
            .slice(0, 5);
    }, [documents]);

    const todayLabel = useMemo(
        () => new Date().toLocaleDateString('en-US', { weekday: 'short' }),
        [],
    );

    const todaySlots = useMemo(
        () => WEEKLY_TIMETABLE.filter((slot) => slot.day.toLowerCase() === todayLabel.toLowerCase()),
        [todayLabel],
    );

    const nextClass = useMemo(() => {
        const now = new Date();
        const nowDay = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const dayOrder = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const nowIdx = dayOrder.indexOf(nowDay);

        const withDelta = WEEKLY_TIMETABLE.map((slot) => {
            const slotIdx = dayOrder.indexOf(slot.day.toLowerCase());
            let dayDelta = slotIdx - nowIdx;
            if (dayDelta < 0) dayDelta += 7;
            const startMins = toMinutes(slot.start);
            if (dayDelta === 0 && startMins < nowMins) dayDelta = 7;
            return { slot, delta: dayDelta * 24 * 60 + startMins - nowMins };
        }).sort((a, b) => a.delta - b.delta);

        return withDelta[0]?.slot || null;
    }, []);

    const metrics = [
        {
            label: 'Accessible Docs',
            value: String(Math.max(Number(exportData?.documents || 0), documents.length)),
            icon: FileText,
            hint: 'Role-scoped documents',
        },
        {
            label: 'Notices (30d)',
            value: String(Math.max(Number(exportData?.notices || 0), noticeDocs.length)),
            icon: Bell,
            hint: 'Recent faculty notices',
        },
        { label: 'Total Queries', value: exportData ? String(exportData.queries) : '0', icon: Activity, hint: 'From your account history' },
        { label: 'Department', value: user?.department || 'Not set', icon: Building2, hint: user?.program || 'Teaching area not set' },
    ];

    const openChatPrefill = (prefill: string) => {
        navigate('/dashboard/chat', { state: { prefill } });
    };

    return (
        <div className="p-6 md:p-8 space-y-7 pb-20 w-full max-w-7xl mx-auto overflow-x-hidden">
            <header className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-r from-zinc-900 via-zinc-900/95 to-slate-900/80 p-6">
                <div className="absolute -top-20 right-6 w-64 h-64 bg-cyan-400/10 blur-[90px] rounded-full pointer-events-none" />
                <div className="absolute -bottom-16 left-8 w-56 h-56 bg-orange-500/10 blur-[90px] rounded-full pointer-events-none" />
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                            <CalendarDays className="w-3.5 h-3.5 text-orange-400" /> Faculty Workspace
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                            Welcome <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">{displayName}</span>
                        </h1>
                        <p className="text-zinc-400 text-sm max-w-xl">
                            Timetable-first faculty operations dashboard with notices, class flow, and teaching actions.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Link to="/dashboard/timetable">
                            <Button variant="outline" className="h-11 rounded-2xl px-5 text-zinc-200 border-white/15 hover:text-white text-sm">
                                <CalendarDays className="w-4 h-4 mr-2" /> Open Timetable
                            </Button>
                        </Link>
                        <Link to="/dashboard/documents">
                            <Button className="bg-white text-black hover:bg-zinc-200 font-semibold px-6 h-11 rounded-2xl shadow-lg text-sm">
                                <FileText className="w-4 h-4 mr-2" /> Upload Document
                            </Button>
                        </Link>
                        <Link to="/dashboard/chat">
                            <Button className="bg-orange-600 hover:bg-orange-500 text-white font-semibold px-6 h-11 rounded-2xl shadow-lg shadow-orange-500/20 text-sm">
                                <Sparkles className="w-4 h-4 mr-2" /> Faculty Assistant
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/65 to-zinc-950/60 p-5">
                        <div className="flex items-start justify-between mb-3">
                            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] text-orange-400">
                                <item.icon className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wider mb-1">{item.label}</p>
                        <h3 className="text-2xl font-extrabold text-white leading-none">{item.value}</h3>
                        <p className="text-[11px] text-zinc-600 mt-2">{item.hint}</p>
                    </div>
                ))}
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <section id="weekly-timetable" className="xl:col-span-8 rounded-3xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6 scroll-mt-24">
                    <div className="flex items-center justify-between mb-4 gap-3">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Clock3 className="w-4 h-4 text-orange-400" /> Weekly Teaching Timetable
                        </h3>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Mon-Sun</span>
                            <Link to="/dashboard/timetable" className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-orange-400">
                                Full page
                            </Link>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 6 }).map((_, idx) => (
                                <div key={`faculty-timetable-skeleton-${idx}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                                    <Skeleton className="h-4 w-36 mb-2" />
                                    <Skeleton className="h-3 w-48" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {WEEKLY_TIMETABLE.map((slot) => (
                                <div key={`${slot.day}-${slot.start}-${slot.course}`} className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{slot.day}</span>
                                        <span className="text-[11px] text-zinc-400 font-semibold">
                                            {slot.start} - {slot.end}
                                        </span>
                                    </div>
                                    <p className="text-sm font-semibold text-white mt-1 truncate">{slot.course}</p>
                                    <p className="text-[11px] text-zinc-500 mt-1">
                                        {slot.room} - {slot.type}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="xl:col-span-4 rounded-3xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6 space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-orange-400" /> Today & Next Class
                    </h3>
                    <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Today</p>
                        {todaySlots.length > 0 ? (
                            <div className="space-y-2">
                                {todaySlots.map((slot) => (
                                    <div key={`${slot.day}-${slot.start}-${slot.course}`} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                                        <p className="text-xs font-semibold text-white">{slot.course}</p>
                                        <p className="text-[11px] text-zinc-500 mt-1">{slot.start} - {slot.end} | {slot.room}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-zinc-500">No classes scheduled today.</p>
                        )}
                    </div>

                    <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Next Class</p>
                        {nextClass ? (
                            <>
                                <p className="text-sm font-semibold text-white">{nextClass.course}</p>
                                <p className="text-[11px] text-zinc-500 mt-1">
                                    {nextClass.day} | {nextClass.start} - {nextClass.end} | {nextClass.room}
                                </p>
                            </>
                        ) : (
                            <p className="text-xs text-zinc-500">No next class found.</p>
                        )}
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <section className="xl:col-span-8 rounded-3xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Megaphone className="w-4 h-4 text-orange-400" /> Departmental Circulars
                        </h3>
                        <Link to="/dashboard/notices" className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-orange-400">
                            Notices
                        </Link>
                    </div>
                    {isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 4 }).map((_, idx) => (
                                <div key={`faculty-notice-skeleton-${idx}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                                    <Skeleton className="h-4 w-56 mb-2" />
                                    <Skeleton className="h-3 w-36" />
                                </div>
                            ))}
                        </div>
                    ) : noticeDocs.length === 0 ? (
                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-sm text-zinc-500">
                            No circular documents found in your scope.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {noticeDocs.map((doc) => (
                                <div key={doc.id} className="rounded-xl border border-white/[0.06] bg-black/30 p-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-white truncate">{doc.filename}</p>
                                        <p className="text-[11px] text-zinc-500 mt-1">
                                            {toRelativeTime(doc.uploaded_at || doc.created_at)} | {doc.doc_type}
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        className="text-[10px] uppercase tracking-wider text-zinc-400 hover:text-orange-300"
                                        onClick={() => openChatPrefill(`Summarize this faculty notice and required actions: ${doc.filename}`)}
                                    >
                                        Summarize <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="xl:col-span-4 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/70 to-zinc-900/35 p-5 sm:p-6">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                        <BookOpen className="w-4 h-4 text-orange-400" /> Quick Faculty Actions
                    </h3>
                    <div className="space-y-3">
                        {[
                            'Show pending circular approvals for this week.',
                            'Draft a student-facing summary for tomorrow classes.',
                            'List urgent notices for my department.',
                        ].map((prompt) => (
                            <button
                                key={prompt}
                                onClick={() => openChatPrefill(prompt)}
                                className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-orange-500/25 transition-all text-left text-xs text-zinc-300"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                </section>
            </div>

            <section className="rounded-3xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-orange-400" /> Recent Documents In Your Scope
                    </h3>
                    <Link to="/dashboard/documents" className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-orange-400">
                        Open Upload Console
                    </Link>
                </div>
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, idx) => (
                            <div key={`faculty-doc-skeleton-${idx}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                                <Skeleton className="h-4 w-48 mb-2" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        ))}
                    </div>
                ) : scopedDocs.length === 0 ? (
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-sm text-zinc-500">
                        No role-scoped documents found yet. Upload or wait for admin/faculty notices.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {scopedDocs.map((doc) => (
                            <div key={doc.id} className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                                <p className="text-sm font-semibold text-white truncate">{doc.filename}</p>
                                <p className="text-[11px] text-zinc-500 mt-1">
                                    {doc.doc_type} | {toRelativeTime(doc.uploaded_at || doc.created_at)}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
