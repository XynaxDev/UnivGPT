/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Mail, Sparkles, UserCircle, BookOpen, CalendarClock } from 'lucide-react';
import { motion } from 'framer-motion';
import { authApi, type CourseDirectoryItem, type FacultySummary } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const initialsFromName = (name: string) => {
    const cleaned = name.trim();
    if (!cleaned) return 'FC';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const formatDate = (raw?: string | null) => {
    if (!raw) return 'No recent update';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return 'No recent update';
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function FacultyProfilePage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { token, user } = useAuthStore();
    const { showToast } = useToastStore();
    const [faculty, setFaculty] = useState<FacultySummary | null>(null);
    const [courses, setCourses] = useState<CourseDirectoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const totalNotices = useMemo(
        () => courses.reduce((sum, item) => sum + Number(item.notice_count || 0), 0),
        [courses]
    );

    useEffect(() => {
        const role = String(user?.role || '').toLowerCase();
        if (role === 'faculty') {
            navigate('/dashboard', { replace: true });
        }
    }, [user?.role, navigate]);

    useEffect(() => {
        let active = true;
        const load = async () => {
            if (!token) return;
            setLoading(true);
            try {
                const [res, courseRes] = await Promise.all([
                    authApi.getFacultyDirectory(token, 30),
                    authApi.getCourseDirectory(token, 45),
                ]);
                if (!active) return;
                const found = (res.faculty || []).find((f) => f.id === id) || null;
                setFaculty(found);
                if (found) {
                    setCourses((courseRes.courses || []).filter((course) => (course.faculty_ids || []).includes(found.id)));
                } else {
                    setCourses([]);
                }
            } catch (err: any) {
                if (!active) return;
                showToast(err?.message || 'Unable to load faculty profile.', 'error');
                setFaculty(null);
                setCourses([]);
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [id, token, showToast]);

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-6xl mx-auto p-6 md:p-8 pb-24 space-y-6">
                <div className="flex items-center justify-between gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="h-10 px-4 rounded-xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.06] text-sm text-white inline-flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <Button
                        variant="outline"
                        onClick={() => navigate('/dashboard/faculty')}
                        className="h-10 px-4 rounded-xl border-white/[0.12] bg-white/[0.03] text-zinc-300 hover:text-white"
                    >
                        <BookOpen className="w-4 h-4 mr-2" /> Faculty Directory
                    </Button>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900 via-zinc-900/85 to-black overflow-hidden"
                >
                    {loading ? (
                        <div className="p-6 space-y-5">
                            <div className="flex items-center gap-4">
                                <Skeleton className="w-16 h-16 rounded-2xl" />
                                <div className="space-y-2">
                                    <Skeleton className="h-6 w-56" />
                                    <Skeleton className="h-4 w-40" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <Skeleton className="h-20 w-full rounded-2xl xl:col-span-2" />
                                <Skeleton className="h-20 w-full rounded-2xl" />
                                <Skeleton className="h-20 w-full rounded-2xl" />
                                <Skeleton className="h-20 w-full rounded-2xl" />
                                <Skeleton className="h-20 w-full rounded-2xl" />
                            </div>
                            <Skeleton className="h-40 w-full rounded-2xl" />
                        </div>
                    ) : !faculty ? (
                        <div className="p-6">
                            <p className="text-sm text-zinc-500">Faculty profile not found.</p>
                        </div>
                    ) : (
                        <div className="space-y-0">
                            <div className="relative border-b border-white/[0.08] px-6 py-6 md:px-7 md:py-7 bg-gradient-to-r from-orange-500/[0.08] via-zinc-900/30 to-cyan-500/[0.08]">
                                <div className="absolute -top-16 right-10 w-44 h-44 rounded-full bg-orange-500/15 blur-[80px] pointer-events-none" />
                                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl border border-orange-400/30 bg-gradient-to-br from-orange-500/20 to-amber-400/15 flex items-center justify-center shrink-0">
                                            {faculty.avatar_url ? (
                                                <img src={faculty.avatar_url} alt={faculty.full_name} className="w-full h-full rounded-2xl object-cover" />
                                            ) : (
                                                <span className="text-lg font-black text-orange-200">{initialsFromName(faculty.full_name)}</span>
                                            )}
                                        </div>
                                        <div>
                                            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">{faculty.full_name}</h1>
                                            <p className="text-sm text-zinc-400 mt-1">{faculty.program || 'Faculty Member'}</p>
                                            <p className="text-xs text-zinc-500 mt-1 capitalize">{faculty.department || 'Department not set'}</p>
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() =>
                                            navigate('/dashboard/chat', {
                                                state: { prefill: `Summarize latest updates for faculty ${faculty.full_name} and mapped courses.` },
                                            })
                                        }
                                        className="h-11 px-5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold"
                                    >
                                        <Sparkles className="w-4 h-4 mr-2" /> Ask About This Faculty
                                    </Button>
                                </div>
                            </div>

                            <div className="p-6 md:p-7 grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 xl:col-span-2">
                                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Contact</p>
                                    <p className="text-sm text-white font-medium mt-2 flex items-center gap-2">
                                        <Mail className="w-4 h-4 text-zinc-500" /> {faculty.email || 'Not provided'}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Department</p>
                                    <p className="text-sm text-white font-medium mt-2 flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-zinc-500" /> {faculty.department || 'Not set'}
                                    </p>
                                </div>

                                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Mapped Courses</p>
                                    <p className="text-2xl font-black text-white mt-2">{courses.length}</p>
                                </div>
                                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Notice Footprint</p>
                                    <p className="text-2xl font-black text-orange-300 mt-2">{totalNotices}</p>
                                </div>
                                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Role</p>
                                    <p className="text-sm text-white font-semibold mt-2 flex items-center gap-2">
                                        <UserCircle className="w-4 h-4 text-zinc-500" /> Faculty
                                    </p>
                                </div>
                            </div>

                            <div className="p-6 md:p-7 pt-0">
                                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Courses Assigned</p>
                                        <span className="text-[10px] text-zinc-600">{courses.length} total</span>
                                    </div>
                                    {courses.length === 0 ? (
                                        <p className="text-sm text-zinc-500">No mapped courses found yet.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {courses.map((course) => (
                                                <button
                                                    key={course.id}
                                                    onClick={() =>
                                                        navigate('/dashboard/chat', {
                                                            state: {
                                                                prefill: `Show updates and key notices for ${course.code} ${course.title}.`,
                                                            },
                                                        })
                                                    }
                                                    className={cn(
                                                        'rounded-xl border border-white/[0.08] bg-zinc-900/60 p-3 text-left hover:border-orange-500/30 hover:bg-orange-500/[0.04] transition-all'
                                                    )}
                                                >
                                                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{course.code}</p>
                                                    <p className="text-sm font-semibold text-white mt-1 line-clamp-1">{course.title}</p>
                                                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                                                        <span>{course.department || 'General'}</span>
                                                        <span className="inline-flex items-center gap-1">
                                                            <CalendarClock className="w-3.5 h-3.5" /> {formatDate(course.next_update_at)}
                                                        </span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>

                {!loading && faculty && (
                    <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/30 p-4 text-xs text-zinc-500">
                        Tip: Click any mapped course card to open chat with prefilled faculty-course context.
                    </div>
                )}
            </div>
        </div>
    );
}


