import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight, GraduationCap, Mail, UserRound } from 'lucide-react';
import { authApi, type CourseDirectoryItem, type FacultySummary } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { useToastStore } from '@/store/toastStore';

const initialsFromName = (name: string) => {
    const clean = name.trim();
    if (!clean) return 'F';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export default function FacultyDirectoryPage() {
    const { token } = useAuthStore();
    const { showToast } = useToastStore();
    const navigate = useNavigate();
    const location = useLocation();
    const [facultyRows, setFacultyRows] = useState<FacultySummary[]>([]);
    const [courseRows, setCourseRows] = useState<CourseDirectoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const focusName = (location.state as { focusFaculty?: string } | null)?.focusFaculty?.toLowerCase() || '';

    useEffect(() => {
        let active = true;
        const load = async () => {
            if (!token) return;
            setIsLoading(true);
            try {
                const [facultyRes, coursesRes] = await Promise.all([
                    authApi.getFacultyDirectory(token, 80),
                    authApi.getCourseDirectory(token, 120),
                ]);
                if (!active) return;
                setFacultyRows(facultyRes.faculty || []);
                setCourseRows(coursesRes.courses || []);
            } catch (err: any) {
                if (!active) return;
                showToast(err?.message || 'Failed to load faculty directory.', 'error');
                setFacultyRows([]);
                setCourseRows([]);
            } finally {
                if (active) setIsLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [token, showToast]);

    const courseMap = useMemo(() => {
        const map: Record<string, CourseDirectoryItem[]> = {};
        for (const course of courseRows) {
            for (const facultyId of course.faculty_ids || []) {
                if (!map[facultyId]) map[facultyId] = [];
                map[facultyId].push(course);
            }
        }
        return map;
    }, [courseRows]);

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-7xl mx-auto p-6 md:p-8 pb-24 space-y-6">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/[0.08] bg-gradient-to-r from-zinc-900 via-zinc-900/95 to-slate-900/80 p-5 md:p-6"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                                <GraduationCap className="w-6 h-6 text-cyan-400" /> Faculty Directory
                            </h1>
                            <p className="text-zinc-500 text-sm mt-1">
                                Faculty mapped to your accessible courses and department scope.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => navigate('/dashboard/courses')}
                            className="h-10 px-4 rounded-xl border-white/[0.12] bg-white/[0.03] text-zinc-200 hover:text-white text-xs"
                        >
                            <BookOpen className="w-4 h-4 mr-2" /> Back To Courses
                        </Button>
                    </div>
                </motion.div>

                {isLoading && (
                    <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/35 p-6 text-sm text-zinc-500">
                        Loading faculty directory...
                    </div>
                )}

                {!isLoading && facultyRows.length === 0 && (
                    <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/35 p-6 text-sm text-zinc-500">
                        No faculty profiles found yet for your current scope.
                    </div>
                )}

                {!isLoading && facultyRows.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {facultyRows.map((faculty) => {
                            const mappedCourses = courseMap[faculty.id] || [];
                            const highlighted = focusName && faculty.full_name.toLowerCase().includes(focusName);
                            return (
                                <button
                                    key={faculty.id}
                                    onClick={() => navigate(`/dashboard/faculty/${faculty.id}`)}
                                    className={`rounded-2xl border p-4 text-left transition-all ${
                                        highlighted
                                            ? 'border-cyan-400/45 bg-cyan-400/5'
                                            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.18]'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl border border-cyan-400/25 bg-cyan-400/10 flex items-center justify-center text-[11px] font-bold text-cyan-200 shrink-0">
                                            {initialsFromName(faculty.full_name)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-white truncate">{faculty.full_name}</p>
                                            <p className="text-xs text-zinc-500 truncate mt-0.5">{faculty.program || faculty.department || 'Faculty Member'}</p>
                                            <p className="text-[11px] text-zinc-400 truncate mt-2 flex items-center gap-1.5">
                                                <Mail className="w-3.5 h-3.5 text-zinc-600" /> {faculty.email || 'No email'}
                                            </p>
                                            <div className="mt-3 flex items-center justify-between">
                                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                                                    {mappedCourses.length} course{mappedCourses.length === 1 ? '' : 's'} mapped
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300 font-semibold">
                                                    Open Profile <ChevronRight className="w-3.5 h-3.5" />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
