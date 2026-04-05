/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DateTimetableAgenda } from '@/components/timetable/DateTimetableAgenda';
import { useAuthStore } from '@/store/authStore';
import { authApi, documentsApi, type CourseDirectoryItem, type DocumentResponse, type FacultySummary } from '@/lib/api';
import { buildLiveTimetableSlots } from '@/lib/timetable';
import { Download, Sparkles } from 'lucide-react';

const TIMETABLE_TAGS = ['timetable', 'time-table', 'schedule', 'routine'];

const normalizeDisplayName = (fullName?: string | null) => {
    const raw = String(fullName || '').trim();
    if (!raw) return 'Faculty';
    const stripped = raw.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').trim();
    return stripped || 'Faculty';
};

const isTimetableDocument = (doc: DocumentResponse) => {
    const filename = String(doc.filename || '').trim().toLowerCase();
    const tags = (doc.tags || []).map((tag) => String(tag || '').trim().toLowerCase());
    return TIMETABLE_TAGS.some((keyword) => filename.includes(keyword) || tags.includes(keyword));
};

export default function FacultyTimetablePage() {
    const { user, token } = useAuthStore();
    const displayName = normalizeDisplayName(user?.full_name);
    const cachedCourses = token ? authApi.peekCourseDirectory(token, 48) : null;
    const cachedDocs = token ? documentsApi.peekList(token, { page: 1, per_page: 24 }) : null;
    const [courses, setCourses] = useState<CourseDirectoryItem[]>(cachedCourses?.courses || []);
    const [documents, setDocuments] = useState<DocumentResponse[]>(cachedDocs?.documents || []);
    const [facultyMembers, setFacultyMembers] = useState<FacultySummary[]>([]);
    const [isLoading, setIsLoading] = useState(!(cachedCourses || cachedDocs));
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;

        const loadTimetableData = async () => {
            if (!token) return;

            if (!(cachedCourses || cachedDocs)) setIsLoading(true);

            try {
                const [coursesResult, docsResult, facultyResult] = await Promise.allSettled([
                    authApi.getCourseDirectory(token, 48),
                    documentsApi.list(token, { page: 1, per_page: 24 }),
                    authApi.getFacultyDirectory(token, 60),
                ]);

                if (!alive) return;

                if (coursesResult.status === 'fulfilled') {
                    setCourses(coursesResult.value.courses || []);
                } else if (!cachedCourses) {
                    setCourses([]);
                }

                if (docsResult.status === 'fulfilled') {
                    setDocuments(docsResult.value.documents || []);
                } else if (!cachedDocs) {
                    setDocuments([]);
                }

                if (facultyResult.status === 'fulfilled') {
                    setFacultyMembers(facultyResult.value.faculty || []);
                } else {
                    setFacultyMembers([]);
                }
            } finally {
                if (alive) setIsLoading(false);
            }
        };

        void loadTimetableData();
        return () => {
            alive = false;
        };
    }, [token]);

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
                currentUserName: user?.full_name,
                facultyLookup,
            }),
        [courses, facultyLookup, user?.department, user?.full_name, user?.id, user?.program, user?.role],
    );

    const timetableDocs = useMemo(() => {
        return [...documents]
            .filter(isTimetableDocument)
            .sort((a, b) => {
                const da = new Date(a.uploaded_at || a.created_at || '').getTime() || 0;
                const db = new Date(b.uploaded_at || b.created_at || '').getTime() || 0;
                return db - da;
            });
    }, [documents]);

    const downloadOriginal = async (doc: DocumentResponse) => {
        if (!token || downloadingId) return;
        setDownloadingId(doc.id);
        try {
            await documentsApi.downloadOriginal(token, doc.id, doc.filename);
        } finally {
            setDownloadingId(null);
        }
    };

    return (
        <div className="h-full overflow-y-auto p-6 md:p-8 w-full">
            <div className="mx-auto max-w-7xl space-y-6">
                <DateTimetableAgenda
                    slots={timetableSlots}
                    title={`Teaching Timetable for ${displayName}`}
                    subtitle="Date-based faculty agenda built from your mapped courses. Monday to Friday follows A to D academic blocks, with lunch held between C and D and weekends kept off."
                    emptyMessage="No faculty timetable could be derived yet from your live course directory. Once mapped courses are available, your daily agenda will appear here."
                    isLoading={isLoading}
                    action={
                        <>
                            <Link
                                to="/dashboard/chat"
                                state={{ prefill: 'Help me review today’s faculty timetable, class blocks, and any related notices in my teaching schedule.' }}
                            >
                                <Button className="h-11 rounded-2xl bg-orange-600 px-5 text-white hover:bg-orange-500">
                                    <Sparkles className="mr-2 h-4 w-4" /> Faculty Assistant
                                </Button>
                            </Link>
                            <Link to="/dashboard">
                                <Button variant="outline" className="h-11 rounded-2xl border-white/15 px-5 text-zinc-200 hover:text-white">
                                    Back To Faculty Dashboard
                                </Button>
                            </Link>
                        </>
                    }
                />

                <section className="rounded-[28px] border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Original Timetable Files</div>
                            <h2 className="mt-1 text-xl font-black text-white">Download Uploaded Timetable PDFs</h2>
                            <p className="mt-1 text-sm text-zinc-400">
                                Role-scoped timetable documents tagged by admin and faculty are listed here for direct download.
                            </p>
                        </div>
                        <div className="text-sm text-zinc-500">{timetableDocs.length} file{timetableDocs.length === 1 ? '' : 's'}</div>
                    </div>

                    <div className="mt-5 space-y-3">
                        {timetableDocs.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-5 text-sm text-zinc-500">
                                No timetable-tagged files are available in your current faculty scope.
                            </div>
                        ) : (
                            timetableDocs.map((doc) => (
                                <div
                                    key={doc.id}
                                    className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold text-white truncate">{doc.filename}</div>
                                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                                            <span>{doc.doc_type}</span>
                                            {doc.department ? <span>· {doc.department}</span> : null}
                                            {doc.course ? <span>· {doc.course}</span> : null}
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={() => void downloadOriginal(doc)}
                                        disabled={downloadingId === doc.id}
                                        className="h-10 rounded-xl bg-white text-black hover:bg-zinc-200"
                                    >
                                        <Download className="mr-2 h-4 w-4" />
                                        {downloadingId === doc.id ? 'Preparing Download...' : 'Download Original PDF'}
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}


