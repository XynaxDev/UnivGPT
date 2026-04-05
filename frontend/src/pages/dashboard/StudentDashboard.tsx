/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Calendar,
    CheckCircle2,
    ArrowUpRight,
    Sparkles,
    Wallet,
    Bell,
    MapPin,
    Info,
    ChevronRight,
    BookOpen,
    FileText,
    Activity,
    GraduationCap,
    UserRound,
    Coffee,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { authApi, documentsApi, type CourseDirectoryItem, type DocumentResponse, type UserExportData, type FacultySummary } from '@/lib/api';
import { buildLiveTimetableSlots, formatTimetableTime, getAcademicHoliday, getTimetableBlockLabel, getTodayWorkdayLabel, summarizeTimetable } from '@/lib/timetable';

type DashboardNotice = {
    id: string;
    title: string;
    tag: string;
    dateLabel: string;
    priority: 'high' | 'medium' | 'low';
};

type FacultyCard = {
    id: string;
    full_name: string;
    subtitle: string;
    avatar_url?: string | null;
    synthetic?: boolean;
};

const toShortDate = (value?: string) => {
    if (!value) return 'Unknown date';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Unknown date';
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const toRelativeTime = (value?: string) => {
    if (!value) return 'Recently';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Recently';
    const diffMs = Date.now() - parsed.getTime();
    const mins = Math.floor(diffMs / (1000 * 60));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
};

const normalizeDisplayName = (fullName?: string | null) => {
    const raw = String(fullName || '').trim();
    if (!raw) return 'Student';
    const stripped = raw.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').trim();
    if (!stripped) return 'Student';
    return stripped;
};

const isNoticeDoc = (doc: DocumentResponse) => {
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

const mapNotice = (doc: DocumentResponse): DashboardNotice => {
    const tags = (doc.tags || []).map((tag) => tag.toLowerCase());
    const highPriority = tags.includes('urgent') || tags.includes('important');
    const mediumPriority = tags.includes('deadline') || tags.includes('event');

    return {
        id: doc.id,
        title: doc.filename,
        tag: doc.doc_type || 'document',
        dateLabel: toRelativeTime(doc.uploaded_at || doc.created_at),
        priority: highPriority ? 'high' : mediumPriority ? 'medium' : 'low',
    };
};

const initialsFromName = (name: string) => {
    const clean = name.trim();
    if (!clean) return 'F';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const buildFallbackFacultyCards = (program?: string | null): FacultyCard[] => {
    const programHint = (program || 'Core').toUpperCase();
    return [
        { id: 'fallback-fac-1', full_name: 'Dr. Priya Sharma', subtitle: `${programHint} Mentor`, synthetic: true },
        { id: 'fallback-fac-2', full_name: 'Prof. Rohan Verma', subtitle: 'Academic Coordinator', synthetic: true },
        { id: 'fallback-fac-3', full_name: 'Dr. Meera Nair', subtitle: 'Student Advisor', synthetic: true },
    ];
};

export default function StudentDashboard() {
    const { user, token } = useAuthStore();
    const navigate = useNavigate();
    const displayName = normalizeDisplayName(user?.full_name);
    const cachedExport = token ? authApi.peekExportUserData(token) : null;
    const cachedDocs = token ? documentsApi.peekList(token, { page: 1, per_page: 24 }) : null;
    const cachedFaculty = token ? authApi.peekFacultyDirectory(token, 12) : null;
    const cachedCourses = token ? authApi.peekCourseDirectory(token, 24) : null;
    const [exportData, setExportData] = useState<UserExportData | null>(cachedExport ?? null);
    const [documents, setDocuments] = useState<DocumentResponse[]>(cachedDocs?.documents || []);
    const [facultyMembers, setFacultyMembers] = useState<FacultySummary[]>(cachedFaculty?.faculty || []);
    const [courses, setCourses] = useState<CourseDirectoryItem[]>(cachedCourses?.courses || []);
    const [facultyLoading, setFacultyLoading] = useState(!cachedFaculty);

    useEffect(() => {
        let alive = true;
        const loadData = async () => {
            if (!token) return;
            const needsExport = !cachedExport;
            const needsDocs = !cachedDocs;
            const needsFaculty = !cachedFaculty;
            const needsCourses = !cachedCourses;
            if (needsFaculty) setFacultyLoading(true);
            try {
                const [exportResult, docsResult, facultyResult, coursesResult] = await Promise.allSettled([
                    needsExport
                        ? authApi.exportUserData(token)
                        : Promise.resolve(cachedExport),
                    needsDocs
                        ? documentsApi.list(token, { page: 1, per_page: 24 })
                        : Promise.resolve(cachedDocs),
                    needsFaculty
                        ? authApi.getFacultyDirectory(token, 12)
                        : Promise.resolve(cachedFaculty),
                    needsCourses
                        ? authApi.getCourseDirectory(token, 24)
                        : Promise.resolve(cachedCourses),
                ]);

                if (!alive) return;

                if (exportResult.status === 'fulfilled' && exportResult.value) {
                    setExportData(exportResult.value);
                }
                if (docsResult.status === 'fulfilled' && docsResult.value) {
                    setDocuments(docsResult.value.documents || []);
                }
                if (facultyResult.status === 'fulfilled' && facultyResult.value) {
                    setFacultyMembers(facultyResult.value.faculty || []);
                } else if (needsFaculty) {
                    setFacultyMembers([]);
                }
                if (coursesResult.status === 'fulfilled' && coursesResult.value) {
                    setCourses(coursesResult.value.courses || []);
                } else if (needsCourses) {
                    setCourses([]);
                }
            } catch {
                if (!alive) return;
                if (needsExport && !cachedExport) setExportData(null);
                if (needsDocs && !cachedDocs) setDocuments([]);
                if (needsFaculty && !cachedFaculty) setFacultyMembers([]);
                if (needsCourses && !cachedCourses) setCourses([]);
            } finally {
                if (alive) setFacultyLoading(false);
            }
        };

        loadData();
        return () => {
            alive = false;
        };
    }, [token]);

    const notices = useMemo(() => {
        return documents
            .filter(isNoticeDoc)
            .sort((a, b) => {
                const da = new Date(a.uploaded_at || a.created_at || '').getTime() || 0;
                const db = new Date(b.uploaded_at || b.created_at || '').getTime() || 0;
                return db - da;
            })
            .slice(0, 4)
            .map(mapNotice);
    }, [documents]);

    const facultyCards = useMemo<FacultyCard[]>(() => {
        if (facultyMembers.length > 0) {
            return facultyMembers.slice(0, 4).map((member) => ({
                id: member.id,
                full_name: member.full_name,
                subtitle: member.program || member.department || 'Faculty',
                avatar_url: member.avatar_url || null,
            }));
        }
        return buildFallbackFacultyCards(user?.program);
    }, [facultyMembers, user?.program]);

    const facultyLookup = useMemo(
        () =>
            Object.fromEntries(
                facultyMembers.map((faculty) => [faculty.id, faculty]),
            ),
        [facultyMembers],
    );

    const timetableSlots = useMemo(
        () =>
            buildLiveTimetableSlots(courses, {
                userId: user?.id,
                role: user?.role,
                department: user?.department,
                program: user?.program,
                facultyLookup,
            }),
        [courses, facultyLookup, user?.department, user?.id, user?.program, user?.role],
    );

    const timetableSummary = useMemo(() => summarizeTimetable(timetableSlots), [timetableSlots]);
    const todayLabel = useMemo(() => getTodayWorkdayLabel(), []);
    const todayHoliday = useMemo(() => getAcademicHoliday(new Date()), []);
    const isWeekendToday = useMemo(
        () => ['sat', 'sun'].includes(todayLabel.toLowerCase()),
        [todayLabel],
    );
    const todaySlots = useMemo(
        () =>
            timetableSlots
                .filter((slot) => slot.day.toLowerCase() === todayLabel.toLowerCase())
                .sort((a, b) => a.start.localeCompare(b.start)),
        [todayLabel, timetableSlots],
    );
    const nowMinutes = useMemo(() => {
        const now = new Date();
        return now.getHours() * 60 + now.getMinutes();
    }, []);
    const featuredTodaySlot = useMemo(() => {
        if (todaySlots.length === 0) return null;
        const upcoming = todaySlots.find((slot) => {
            const [hours, minutes] = slot.start.split(':').map(Number);
            return hours * 60 + minutes >= nowMinutes;
        });
        return upcoming || todaySlots[0];
    }, [nowMinutes, todaySlots]);

    const openChatWithPrefill = (prefill: string) => {
        navigate('/dashboard/chat', { state: { prefill } });
    };

    const openCampusBoard = () => {
        navigate('/dashboard/notifications');
    };

    const openNotice = (documentId: string) => {
        navigate('/dashboard/notifications', {
            state: {
                focusNotificationId: documentId,
                openDocumentId: documentId,
            },
        });
    };

    const openFaculty = (faculty: FacultyCard) => {
        if (!faculty.synthetic) {
            navigate(`/dashboard/faculty/${faculty.id}`);
            return;
        }
        navigate('/dashboard/faculty', { state: { focusFaculty: faculty.full_name } });
    };

    const featuredSlotTone = useMemo(() => {
        if (!featuredTodaySlot) return null;
        if (featuredTodaySlot.type === 'lab') {
            return {
                shell: 'border-sky-400/20 bg-[linear-gradient(160deg,rgba(8,47,73,0.92),rgba(15,23,42,0.95))]',
                block: 'border-sky-300/18 bg-sky-400/10 text-sky-100',
                primaryPill: 'border-sky-300/30 bg-sky-400/16 text-sky-100',
                secondaryPill: 'border-sky-300/14 bg-white/[0.04] text-sky-50/90',
                facultyChip: 'border-sky-300/18 bg-white/[0.04] text-sky-50',
                accent: 'from-sky-400/16 via-cyan-300/10 to-transparent',
            };
        }
        if (featuredTodaySlot.type === 'tutorial') {
            return {
                shell: 'border-violet-400/20 bg-[linear-gradient(160deg,rgba(56,32,99,0.95),rgba(17,24,39,0.96))]',
                block: 'border-violet-300/18 bg-violet-400/12 text-violet-100',
                primaryPill: 'border-violet-300/30 bg-violet-400/16 text-violet-100',
                secondaryPill: 'border-violet-300/14 bg-white/[0.04] text-violet-50/90',
                facultyChip: 'border-violet-300/18 bg-white/[0.04] text-violet-50',
                accent: 'from-violet-400/16 via-fuchsia-300/10 to-transparent',
            };
        }
        return {
            shell: 'border-amber-400/20 bg-[linear-gradient(160deg,rgba(66,32,6,0.95),rgba(17,24,39,0.95))]',
            block: 'border-amber-300/18 bg-amber-400/12 text-amber-100',
            primaryPill: 'border-amber-300/30 bg-amber-400/16 text-amber-100',
            secondaryPill: 'border-amber-300/14 bg-white/[0.04] text-amber-50/90',
            facultyChip: 'border-amber-300/18 bg-white/[0.04] text-amber-50',
            accent: 'from-amber-400/16 via-orange-300/10 to-transparent',
        };
    }, [featuredTodaySlot]);

    const metrics = [
        {
            label: 'Query Count',
            value: exportData ? String(exportData.queries) : '0',
            hint: 'From your account history',
            icon: Activity,
            color: 'text-orange-400',
        },
        {
            label: 'Accessible Docs',
            value: String(Math.max(Number(exportData?.documents || 0), documents.length)),
            hint: 'Live role-scoped documents',
            icon: FileText,
            color: 'text-sky-400',
        },
        {
            label: 'Recent Notices',
            value: String(Math.max(Number(exportData?.notices || 0), notices.length)),
            hint: 'Last 30-day notice feed',
            icon: Bell,
            color: 'text-violet-400',
        },
        {
            label: 'Weekly Blocks',
            value: String(timetableSummary.blocks),
            hint: 'Live course timetable blocks',
            icon: Calendar,
            color: 'text-emerald-400',
        },
    ];

    return (
        <div className="p-6 md:p-8 space-y-7 pb-20 overflow-y-auto h-full max-w-7xl mx-auto w-full">
            <header className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-r from-zinc-900 via-zinc-900/95 to-slate-900/80 p-6">
                <div className="absolute -top-20 right-6 w-64 h-64 bg-cyan-400/10 blur-[90px] rounded-full pointer-events-none" />
                <div className="absolute -bottom-16 left-8 w-56 h-56 bg-orange-500/10 blur-[90px] rounded-full pointer-events-none" />
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                            <GraduationCap className="w-3.5 h-3.5 text-orange-400" /> Student Workspace
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                            Welcome <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">{displayName}</span>
                        </h1>
                        <p className="text-zinc-400 text-sm max-w-xl">
                            Live academic dashboard for notices, faculty contacts, and assistant-driven study actions.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            to="/dashboard/chat"
                            state={{ prefill: 'Help me review today’s notices, timetable, and deadlines in my student scope.' }}
                        >
                            <Button title="Open student assistant chat" className="bg-orange-600 hover:bg-orange-500 text-white font-semibold px-6 h-11 rounded-2xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex gap-2 text-sm">
                                <Sparkles className="w-4 h-4" /> Ask UnivGPT Assistant
                            </Button>
                        </Link>
                        <Link to="/dashboard/courses">
                            <Button title="View your course directory" variant="outline" className="h-11 rounded-2xl px-5 text-zinc-200 border-white/15 hover:text-white">
                                <BookOpen className="w-4 h-4 mr-2" /> Open Courses
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map((item, i) => (
                    <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/65 to-zinc-950/60 p-5 hover:border-white/[0.16] transition-all"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className={cn('p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]', item.color)}>
                                <item.icon className="w-5 h-5" />
                            </div>
                            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-700" />
                        </div>
                        <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wider mb-1">{item.label}</p>
                        <h3 className="text-2xl font-extrabold text-white leading-none">{item.value}</h3>
                        <p className="text-[11px] text-zinc-600 mt-2">{item.hint}</p>
                    </motion.div>
                ))}
            </section>

            <section className="rounded-3xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <UserRound className="w-4 h-4 text-cyan-400" /> Faculty Section
                    </h3>
                    <span className="text-[10px] font-bold text-zinc-600">{facultyLoading ? 'Syncing...' : `${facultyCards.length} mentors`}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {facultyLoading
                        ? Array.from({ length: 4 }).map((_, idx) => (
                            <div
                                key={`student-faculty-skeleton-${idx}`}
                                className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 flex items-center gap-3"
                            >
                                <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <Skeleton className="h-3.5 w-28" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                            </div>
                        ))
                        : facultyCards.map((member) => (
                            <button
                                key={member.id}
                                onClick={() => openFaculty(member)}
                                className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 flex items-center gap-3 hover:border-cyan-400/35 hover:bg-cyan-400/5 transition-all text-left"
                            >
                                <div className="w-10 h-10 rounded-lg border border-cyan-400/25 bg-cyan-400/10 flex items-center justify-center text-[11px] font-bold text-cyan-200 shrink-0">
                                    {member.avatar_url ? (
                                        <img src={member.avatar_url} alt={member.full_name} className="w-full h-full rounded-lg object-cover" />
                                    ) : (
                                        initialsFromName(member.full_name)
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-zinc-200 truncate">{member.full_name}</p>
                                    <p className="text-[10px] text-zinc-500 truncate">{member.subtitle}</p>
                                </div>
                            </button>
                        ))}
                </div>
                <div className="flex justify-end mt-4">
                    <Button
                        variant="outline"
                        onClick={() => navigate('/dashboard/faculty')}
                        title="Open full faculty directory"
                        className="border-white/[0.12] bg-white/[0.03] text-zinc-300 hover:text-white rounded-xl h-10 font-semibold text-xs group"
                    >
                        Explore Faculty Directory
                        <ChevronRight className="w-4 h-4 ml-2 text-zinc-600 group-hover:text-orange-400 transition-colors" />
                    </Button>
                </div>
            </section>

            <section className="rounded-3xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-orange-400" /> Today&apos;s Timetable
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500">
                            Your classes for {todayLabel}, built from the live course directory.
                        </p>
                    </div>
                    <Link to="/dashboard/timetable">
                        <Button variant="outline" className="h-10 rounded-xl border-white/12 bg-white/[0.03] px-4 text-zinc-200 hover:text-white">
                            Open Full Timetable
                        </Button>
                    </Link>
                </div>

                {todaySlots.length === 0 ? (
                    <div className="overflow-hidden rounded-2xl border border-fuchsia-400/15 bg-[linear-gradient(135deg,rgba(88,28,135,0.18),rgba(24,25,31,0.98) 42%,rgba(124,58,237,0.12))] p-5">
                        <div className="relative overflow-hidden rounded-2xl border border-fuchsia-300/10 bg-[radial-gradient(circle_at_top_left,rgba(216,180,254,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-6">
                            <div className="pointer-events-none absolute inset-y-0 right-0 w-64">
                                <div className="absolute right-[-26px] top-1/2 h-44 w-72 -translate-y-1/2 rounded-[44%_56%_42%_58%/58%_38%_62%_42%] border border-fuchsia-300/12 bg-[linear-gradient(135deg,rgba(192,132,252,0.18),rgba(217,70,239,0.08),rgba(255,255,255,0.02))]" />
                                <div className="absolute right-9 top-8 flex h-24 w-24 items-center justify-center rounded-full border border-fuchsia-200/10 bg-[radial-gradient(circle,rgba(244,114,182,0.14),transparent_64%)]">
                                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-200/15 bg-white/[0.04] text-fuchsia-100">
                                        <Coffee className="h-6 w-6" />
                                    </div>
                                </div>
                                <div className="absolute right-12 bottom-6 h-16 w-36 rounded-[999px] bg-fuchsia-300/10 blur-2xl" />
                            </div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-fuchsia-200/70">
                                {todayHoliday ? 'Holiday Window' : isWeekendToday ? 'Weekend Reset' : 'Open Study Window'}
                            </div>
                            <div className="mt-3 text-2xl font-black text-white">
                                {todayHoliday
                                    ? `${todayHoliday.name} keeps the class board clear`
                                    : isWeekendToday
                                        ? 'No class slots are scheduled today'
                                        : 'Your timetable is clear for today'}
                            </div>
                            <div className="mt-3 max-w-2xl text-sm text-zinc-300/90">
                                {todayHoliday
                                    ? 'Campus timing is paused for the holiday. Use the day to recharge, skim notices, and get your next class set ready.'
                                    : isWeekendToday
                                        ? 'Take the weekend pace as a clean reset. Review notes, tie up pending work, and plan the next study run.'
                                        : 'No live class is mapped into today, so you can use the time for revision, labs, and upcoming deadlines.'}
                            </div>
                        </div>
                    </div>
                ) : featuredTodaySlot && featuredSlotTone ? (
                    <div className={cn('relative overflow-hidden rounded-2xl border p-4 sm:p-5', featuredSlotTone.shell)}>
                        <div className={cn('pointer-events-none absolute inset-y-0 right-0 w-56 bg-gradient-to-l blur-2xl', featuredSlotTone.accent)} />
                        <div className="relative grid gap-4 lg:grid-cols-[180px_1fr] lg:items-stretch">
                            <div className={cn('rounded-2xl border p-4 sm:p-5', featuredSlotTone.block)}>
                                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/80">
                                    Block {getTimetableBlockLabel(featuredTodaySlot.start, featuredTodaySlot.end)}
                                </div>
                                <div className="mt-5 text-[2rem] font-black leading-none text-white">
                                    {formatTimetableTime(featuredTodaySlot.start)}
                                </div>
                                <div className="mt-2 text-sm font-medium text-white/72">
                                    to {formatTimetableTime(featuredTodaySlot.end)}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/10 p-4 sm:p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={cn('inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]', featuredSlotTone.primaryPill)}>
                                            {featuredTodaySlot.type}
                                        </span>
                                        <span className={cn('inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', featuredSlotTone.secondaryPill)}>
                                            {featuredTodaySlot.code}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        <span className={cn('inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]', featuredSlotTone.secondaryPill)}>
                                            {featuredTodaySlot.room}
                                        </span>
                                        {featuredTodaySlot.department ? (
                                            <span className={cn('inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]', featuredSlotTone.secondaryPill)}>
                                                {featuredTodaySlot.department}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="mt-4 text-xl font-black leading-tight text-white">
                                    {featuredTodaySlot.course}
                                </div>

                                {featuredTodaySlot.facultyName ? (
                                    featuredTodaySlot.facultyId ? (
                                        <Link
                                            to={`/dashboard/faculty/${featuredTodaySlot.facultyId}`}
                                            className="mt-4 inline-flex items-center gap-3 text-sm font-semibold text-white/95 transition hover:text-white hover:underline"
                                        >
                                            <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full border text-[12px] font-bold uppercase', featuredSlotTone.facultyChip)}>
                                                {featuredTodaySlot.facultyName.slice(0, 1)}
                                            </span>
                                            {featuredTodaySlot.facultyName}
                                        </Link>
                                    ) : (
                                        <div className="mt-4 inline-flex items-center gap-3 text-sm font-semibold text-white/95">
                                            <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full border text-[12px] font-bold uppercase', featuredSlotTone.facultyChip)}>
                                                {featuredTodaySlot.facultyName.slice(0, 1)}
                                            </span>
                                            {featuredTodaySlot.facultyName}
                                        </div>
                                    )
                                ) : null}

                                <div className="mt-5 text-sm font-medium text-white/80">
                                    Next live class for today
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6 h-full">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Bell className="w-4 h-4 text-orange-400" /> Official Notices
                            </h3>
                            <Button
                                variant="ghost"
                                onClick={openCampusBoard}
                                className="text-[10px] font-black tracking-widest uppercase text-zinc-500 hover:text-orange-400 h-auto p-0"
                            >
                                Campus Board
                            </Button>
                        </div>

                        {notices.length === 0 ? (
                            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-sm text-zinc-500">
                                No notice documents found in your current database scope.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {notices.map((notice) => (
                                    <div
                                        key={notice.id}
                                        className="group flex items-center justify-between p-4 rounded-2xl bg-black/30 border border-white/[0.06] hover:border-white/[0.14] transition-all"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className={cn(
                                                    'w-9 h-9 rounded-xl border flex items-center justify-center',
                                                    notice.priority === 'high'
                                                        ? 'bg-red-500/10 border-red-500/25 text-red-400'
                                                        : notice.priority === 'medium'
                                                            ? 'bg-orange-500/10 border-orange-500/25 text-orange-400'
                                                            : 'bg-blue-500/10 border-blue-500/25 text-blue-400',
                                                )}
                                            >
                                                <Info className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-semibold text-white truncate">{notice.title}</h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">{notice.tag}</span>
                                                    <span className="w-1 h-1 rounded-full bg-zinc-800" />
                                                    <span className="text-[10px] text-zinc-500">{notice.dateLabel}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openNotice(notice.id)}
                                            className="text-zinc-600 hover:text-orange-400 uppercase text-[10px] font-bold tracking-widest"
                                        >
                                            View <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-4">
                    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/50 p-5 h-full">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-orange-400" /> Upcoming Focus
                            </h3>
                            <span className="text-[10px] font-bold text-zinc-600">{toShortDate(exportData?.exportDate)}</span>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                                <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Program</p>
                                <p className="text-white font-semibold mt-1">{user?.program || 'Not set'}</p>
                            </div>
                            <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                                <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Semester & Section</p>
                                <p className="text-white font-semibold mt-1">
                                    {user?.semester || 'NA'} / {user?.section || 'NA'}
                                </p>
                            </div>
                            <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                                <p className="text-zinc-500 uppercase tracking-wider text-[10px]">Role Access</p>
                                <p className="text-white font-semibold mt-1 capitalize">{user?.role || 'student'}</p>
                            </div>
                        </div>

                        <Link to="/dashboard/courses" className="block mt-4">
                            <Button title="Open courses section" variant="outline" className="w-full border-white/[0.12] bg-white/[0.03] text-zinc-300 hover:text-white rounded-xl h-11 font-semibold text-xs group">
                                View Course Directory
                                <ChevronRight className="w-4 h-4 ml-2 text-zinc-600 group-hover:text-orange-400 transition-colors" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                    <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-r from-zinc-900 to-black p-6 relative overflow-hidden h-full">
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-orange-500/5 blur-[80px] rounded-full" />
                        <div className="relative z-10 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <MapPin className="w-4 h-4 text-orange-400" />
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Campus Explorer</span>
                                </div>
                                <h3 className="text-2xl font-black text-white leading-tight">Need policy or campus help?</h3>
                                <p className="text-zinc-400 text-sm mt-2 max-w-lg">
                                    Ask about rules, facilities, deadlines, and route-specific notices instantly.
                                </p>
                            </div>
                            <Link to="/dashboard/chat" state={{ prefill: 'Show me the latest student notices with deadlines and categories.' }}>
                                <Button title="Open campus policy chat" className="bg-white text-black hover:bg-zinc-200 h-12 px-7 rounded-xl font-semibold transition-all shadow-xl shadow-black/20 text-sm">
                                    Ask Assistant
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4">
                    <div className="rounded-3xl border border-orange-500/20 bg-orange-600/[0.06] p-5 text-center h-full flex flex-col justify-center">
                        <Wallet className="w-5 h-5 text-orange-500 mx-auto mb-2" />
                        <h4 className="text-[11px] font-bold text-orange-500 uppercase tracking-widest mb-1.5">Data Sync</h4>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                            Dashboard stats are generated from your live profile, notice documents, faculty feed, and query history.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}


