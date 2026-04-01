import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    BookOpen,
    Search,
    Filter,
    Building2,
    Clock,
    ChevronRight,
    LayoutGrid,
    List,
    Download,
    Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { authApi, type CourseDirectoryItem, type FacultySummary } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';

type ViewMode = 'grid' | 'list';

type DisplayFaculty = {
    id: string;
    full_name: string;
    subtitle: string;
    isSynthetic: boolean;
    avatarSeed: string;
};

type CourseWithFaculty = CourseDirectoryItem & {
    faculty: FacultySummary[];
    facultyCards: DisplayFaculty[];
};

const FALLBACK_FACULTY_NAMES = [
    'Prof. Aarav Sharma',
    'Dr. Meera Nair',
    'Prof. Rohan Verma',
    'Dr. Kavya Iyer',
    'Prof. Ananya Gupta',
    'Dr. Siddharth Rao',
];

const FALLBACK_FACULTY_SUBTITLES = [
    'Course Mentor',
    'Subject Coordinator',
    'Academic Advisor',
    'Lab Coordinator',
];

const AVATAR_SWATCHES = [
    'from-orange-500/25 to-amber-500/20 border-orange-500/35 text-orange-200',
    'from-sky-500/20 to-indigo-500/20 border-sky-500/30 text-sky-200',
    'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-200',
    'from-fuchsia-500/20 to-pink-500/20 border-fuchsia-500/30 text-fuchsia-200',
];

const formatDate = (value?: string | null) => {
    if (!value) return 'No recent update';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'No recent update';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const hashSeed = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
};

const initialsFromName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return 'F';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const toDisplayFaculty = (teacher: FacultySummary): DisplayFaculty => ({
    id: teacher.id,
    full_name: teacher.full_name || 'Faculty Member',
    subtitle: teacher.program || teacher.department || 'Faculty',
    isSynthetic: false,
    avatarSeed: teacher.id || teacher.full_name || 'faculty',
});

const buildFallbackFaculty = (course: CourseDirectoryItem, count: number): DisplayFaculty[] => {
    const base = hashSeed(`${course.id}-${course.title}-${course.code}`);
    const items: DisplayFaculty[] = [];
    for (let idx = 0; idx < count; idx += 1) {
        const name = FALLBACK_FACULTY_NAMES[(base + idx) % FALLBACK_FACULTY_NAMES.length];
        const subtitle = FALLBACK_FACULTY_SUBTITLES[(base + idx) % FALLBACK_FACULTY_SUBTITLES.length];
        items.push({
            id: `fallback-${course.id}-${idx}`,
            full_name: name,
            subtitle,
            isSynthetic: true,
            avatarSeed: `${course.id}-fallback-${idx}`,
        });
    }
    return items;
};

export default function CoursesPage() {
    const [view, setView] = useState<ViewMode>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [courses, setCourses] = useState<CourseDirectoryItem[]>([]);
    const [faculty, setFaculty] = useState<FacultySummary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isHydratingFaculty, setIsHydratingFaculty] = useState(false);
    const navigate = useNavigate();
    const { token } = useAuthStore();

    useEffect(() => {
        let active = true;
        const load = async () => {
            if (!token) return;
            setIsLoading(true);
            setIsHydratingFaculty(false);
            try {
                const courseRes = await authApi.getCourseDirectory(token, 60);
                if (!active) return;

                const courseRows = courseRes.courses || [];
                setCourses(courseRows);
                setIsLoading(false);

                const facultyIds = Array.from(
                    new Set(
                        courseRows
                            .flatMap((course) => course.faculty_ids || [])
                            .map((id) => String(id || '').trim())
                            .filter(Boolean)
                    )
                );

                if (facultyIds.length === 0) {
                    setFaculty([]);
                    return;
                }

                setIsHydratingFaculty(true);
                try {
                    const facultyRes = await authApi.getFacultyDirectory(
                        token,
                        Math.min(80, Math.max(25, facultyIds.length + 8))
                    );
                    if (!active) return;
                    const byId = new Map((facultyRes.faculty || []).map((item) => [item.id, item]));
                    const mapped = facultyIds
                        .map((id) => byId.get(id))
                        .filter((item): item is FacultySummary => Boolean(item));
                    setFaculty(mapped);
                } catch {
                    if (!active) return;
                    setFaculty([]);
                } finally {
                    if (active) setIsHydratingFaculty(false);
                }
            } catch (err: any) {
                if (!active) return;
                useToastStore.getState().showToast(err?.message || 'Failed to load course directory.', 'error');
                setCourses([]);
                setFaculty([]);
                setIsLoading(false);
                setIsHydratingFaculty(false);
            }
        };

        load();
        return () => {
            active = false;
        };
    }, [token]);

    const facultyById = useMemo(
        () =>
            faculty.reduce<Record<string, FacultySummary>>((acc, item) => {
                acc[item.id] = item;
                return acc;
            }, {}),
        [faculty]
    );

    const normalizedCourses = useMemo<CourseWithFaculty[]>(
        () =>
            courses.map((course) => {
                const mappedFaculty = (course.faculty_ids || [])
                    .map((id) => facultyById[id])
                    .filter(Boolean);

                const realCards = mappedFaculty.slice(0, 3).map(toDisplayFaculty);
                const fallbackCount = Math.max(2 - realCards.length, 0);
                const fallbackCards = fallbackCount > 0 ? buildFallbackFaculty(course, fallbackCount) : [];

                return {
                    ...course,
                    faculty: mappedFaculty,
                    facultyCards: [...realCards, ...fallbackCards].slice(0, 3),
                };
            }),
        [courses, facultyById]
    );

    const filteredCourses = useMemo(
        () =>
            normalizedCourses.filter((course) => {
                const q = searchQuery.toLowerCase().trim();
                if (!q) return true;
                return (
                    (course.title || '').toLowerCase().includes(q) ||
                    (course.code || '').toLowerCase().includes(q) ||
                    (course.department || '').toLowerCase().includes(q)
                );
            }),
        [normalizedCourses, searchQuery]
    );

    const openInChat = (course: CourseDirectoryItem, mode: 'syllabus' | 'details') => {
        const prefill =
            mode === 'syllabus'
                ? `Share the latest syllabus highlights for ${course.code} ${course.title}.`
                : `Give me full academic details for ${course.code} ${course.title}, including schedule, updates, and faculty contacts.`;
        navigate('/dashboard/chat', { state: { prefill } });
    };

    const openFaculty = (id: string) => {
        navigate(`/dashboard/faculty/${id}`);
    };

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-6 md:p-8 space-y-8 pb-20 max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/90 to-zinc-900/40 p-5 md:p-6">
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tight">Curriculum Directory</h1>
                        <p className="text-zinc-500 text-sm mt-1">
                            Dynamic course feed from uploaded documents, with mapped faculty and live updates.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
                            <button
                                onClick={() => setView('grid')}
                                className={cn(
                                    'p-1.5 rounded-lg transition-all',
                                    view === 'grid'
                                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                )}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setView('list')}
                                className={cn(
                                    'p-1.5 rounded-lg transition-all',
                                    view === 'list'
                                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                )}
                            >
                                <List className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search course, code, or department..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.05] transition-all"
                        />
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setSearchQuery('')}
                        className="h-12 px-6 border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:text-white rounded-2xl flex items-center gap-2 font-semibold text-xs"
                    >
                        <Filter className="w-4 h-4" />
                        CLEAR FILTER
                    </Button>
                </div>

                {isLoading && <div className="text-sm text-zinc-500">Loading course directory...</div>}
                {!isLoading && isHydratingFaculty && (
                    <div className="text-xs text-zinc-600">Refreshing faculty mapping in background...</div>
                )}

                {!isLoading && filteredCourses.length === 0 && (
                    <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/35 p-6 text-sm text-zinc-500">
                        No course documents available yet for your role. Upload course documents to populate this section.
                    </div>
                )}

                {!isLoading && view === 'grid' && filteredCourses.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredCourses.map((course, idx) => (
                            <motion.div
                                key={course.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.04 }}
                                className="group relative bg-white/[0.02] border border-white/[0.06] rounded-[2rem] overflow-hidden hover:border-orange-500/30 transition-all p-7 flex flex-col"
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <div className="p-3 bg-orange-500/10 rounded-2xl border border-orange-500/20 text-orange-500">
                                        <BookOpen className="w-6 h-6" />
                                    </div>
                                    <span className="text-[10px] font-black bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-zinc-500 tracking-widest uppercase">
                                        {course.code}
                                    </span>
                                </div>

                                <div className="space-y-1 mb-5">
                                    <h3 className="text-lg font-black text-white group-hover:text-orange-400 transition-colors leading-tight">
                                        {course.title}
                                    </h3>
                                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                                        {course.department || 'General'}
                                    </p>
                                </div>

                                <div className="pt-5 border-t border-white/[0.05] space-y-4 mb-6">
                                    <div>
                                        <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-2">Faculty Team</p>
                                        <div className="space-y-2">
                                            {course.facultyCards.map((member) => {
                                                const swatch = AVATAR_SWATCHES[hashSeed(member.avatarSeed) % AVATAR_SWATCHES.length];
                                                const cardBody = (
                                                    <>
                                                        <div
                                                            className={cn(
                                                                'w-9 h-9 rounded-xl border bg-gradient-to-br flex items-center justify-center text-[11px] font-bold shrink-0',
                                                                swatch
                                                            )}
                                                        >
                                                            {initialsFromName(member.full_name)}
                                                        </div>
                                                        <div className="min-w-0 flex-1 text-left">
                                                            <p className="text-xs text-zinc-200 font-semibold truncate">{member.full_name}</p>
                                                            <p className="text-[10px] text-zinc-500 truncate">{member.subtitle}</p>
                                                        </div>
                                                        {!member.isSynthetic && <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
                                                    </>
                                                );

                                                if (member.isSynthetic) {
                                                    return (
                                                        <div
                                                            key={member.id}
                                                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 flex items-center gap-3"
                                                        >
                                                            {cardBody}
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <button
                                                        key={member.id}
                                                        onClick={() => openFaculty(member.id)}
                                                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-orange-500/30 px-3 py-2 flex items-center gap-3 transition-all"
                                                    >
                                                        {cardBody}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                                            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-1">Department</p>
                                            <p className="text-xs text-zinc-300 font-semibold truncate">{course.department || 'General'}</p>
                                        </div>
                                        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                                            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-1">Latest Update</p>
                                            <p className="text-xs text-zinc-300 font-semibold truncate">{formatDate(course.next_update_at)}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-[11px] text-zinc-500 mb-3">
                                    {course.notice_count} document update{course.notice_count === 1 ? '' : 's'}
                                </div>

                                <div className="mt-auto flex gap-2">
                                    <Button
                                        onClick={() => openInChat(course, 'syllabus')}
                                        className="flex-1 bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.06] h-12 rounded-xl text-xs font-semibold transition-all group/btn"
                                    >
                                        <Download className="w-4 h-4 mr-2 text-zinc-500 group-hover/btn:text-orange-400 transition-colors" />
                                        SYLLABUS
                                    </Button>
                                    <Button
                                        size="icon"
                                        onClick={() => openInChat(course, 'details')}
                                        className="w-12 h-12 bg-orange-600 hover:bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </Button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {!isLoading && view === 'list' && filteredCourses.length > 0 && (
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-[2rem] overflow-hidden">
                        {filteredCourses.map((course) => (
                            <div
                                key={course.id}
                                className="p-6 flex items-center justify-between gap-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.01] transition-colors"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500 shrink-0 border border-orange-500/20">
                                        <Building2 className="w-6 h-6" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-black text-white truncate">{course.title}</h4>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest">{course.code}</span>
                                            <span className="w-1 h-1 rounded-full bg-zinc-800" />
                                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest truncate">
                                                {course.department || 'General'}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                            {course.facultyCards.map((member) => {
                                                const swatch = AVATAR_SWATCHES[hashSeed(member.avatarSeed) % AVATAR_SWATCHES.length];
                                                const chip = (
                                                    <>
                                                        <div
                                                            className={cn(
                                                                'w-5 h-5 rounded-md border bg-gradient-to-br flex items-center justify-center text-[9px] font-bold',
                                                                swatch
                                                            )}
                                                        >
                                                            {initialsFromName(member.full_name)}
                                                        </div>
                                                        <span className="text-[10px] font-semibold text-zinc-300 truncate max-w-[140px]">
                                                            {member.full_name}
                                                        </span>
                                                    </>
                                                );
                                                if (member.isSynthetic) {
                                                    return (
                                                        <div
                                                            key={member.id}
                                                            className="px-2 py-1 rounded-md border border-white/[0.08] bg-white/[0.02] inline-flex items-center gap-1.5"
                                                        >
                                                            {chip}
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <button
                                                        key={member.id}
                                                        onClick={() => openFaculty(member.id)}
                                                        className="px-2 py-1 rounded-md border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-orange-500/30 inline-flex items-center gap-1.5 transition-colors"
                                                    >
                                                        {chip}
                                                    </button>
                                                );
                                            })}
                                            {course.facultyCards.length === 0 && (
                                                <span className="text-[10px] text-zinc-500 inline-flex items-center gap-1">
                                                    <Users className="w-3.5 h-3.5" /> Faculty mapping pending
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="hidden md:flex items-center gap-1 text-[11px] text-zinc-500">
                                        <Clock className="w-3.5 h-3.5" /> {formatDate(course.next_update_at)}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        onClick={() => openInChat(course, 'details')}
                                        className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 font-semibold text-[10px] uppercase tracking-widest"
                                    >
                                        Details
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
