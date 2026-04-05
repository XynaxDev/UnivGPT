/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Mail,
    Shield,
    Calendar,
    Building,
    Edit2,
    Camera,
    X,
    CheckCircle2,
    Save,
    GraduationCap,
    BookOpen,
    Hash,
    Layers,
    BarChart3,
    FileText,
    Bell,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { authApi, documentsApi, type DocumentResponse, type UserExportData } from '@/lib/api';

const roleBadgeStyles: Record<string, string> = {
    student: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    faculty: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    admin: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
};

const iconToneByLabel: Record<string, string> = {
    Email: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
    Role: 'text-orange-300 bg-orange-500/15 border-orange-500/30',
    'Member Since': 'text-violet-300 bg-violet-500/15 border-violet-500/30',
    'Academic Verification': 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
    Program: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30',
    Semester: 'text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-500/30',
    Section: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
    'Roll Number': 'text-amber-300 bg-amber-500/15 border-amber-500/30',
    'Teaching Area': 'text-teal-300 bg-teal-500/15 border-teal-500/30',
    Department: 'text-blue-300 bg-blue-500/15 border-blue-500/30',
    'Access Level': 'text-red-300 bg-red-500/15 border-red-500/30',
    'Admin Unit': 'text-orange-300 bg-orange-500/15 border-orange-500/30',
    'Total Queries': 'text-orange-300 bg-orange-500/15 border-orange-500/30',
    'Accessible Docs': 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
    'Recent Notices': 'text-violet-300 bg-violet-500/15 border-violet-500/30',
};

const isNoticeLike = (doc: DocumentResponse) => {
    const name = String(doc.filename || '').toLowerCase();
    const tags = (doc.tags || []).map((tag) => String(tag).toLowerCase());
    return (
        name.includes('notice') ||
        name.includes('announcement') ||
        name.includes('circular') ||
        tags.includes('notice') ||
        tags.includes('announcement') ||
        tags.includes('circular')
    );
};

const statItems = (data: UserExportData | null, liveDocs: number, liveNotices: number) => [
    {
        label: 'Total Queries',
        value: data ? String(data.queries) : '0',
        icon: BarChart3,
    },
    {
        label: 'Accessible Docs',
        value: String(Math.max(Number(data?.documents || 0), liveDocs)),
        icon: FileText,
    },
    {
        label: 'Recent Notices',
        value: String(Math.max(Number(data?.notices || 0), liveNotices)),
        icon: Bell,
    },
];

function ProviderBadge({ provider }: { provider?: string | null }) {
    const normalized = (provider || 'email').toLowerCase();
    if (normalized === 'google') {
        return (
            <span className="inline-flex items-center gap-2 text-xs text-white font-medium capitalize">
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.3-1.9 3l3 2.3c1.8-1.7 2.8-4.1 2.8-6.9 0-.7-.1-1.4-.2-2.1H12z" />
                    <path fill="#34A853" d="M12 22c2.7 0 5-0.9 6.7-2.6l-3-2.3c-.8.6-2 1-3.6 1-2.7 0-4.9-1.8-5.7-4.2l-3.1 2.4C4.9 19.8 8.2 22 12 22z" />
                    <path fill="#4A90E2" d="M6.3 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9l-3.1-2.4C2.4 9 2 10.5 2 12s.4 3 1.2 4.3l3.1-2.4z" />
                    <path fill="#FBBC05" d="M12 5.8c1.5 0 2.9.5 3.9 1.5l2.9-2.9C17 2.8 14.7 2 12 2 8.2 2 4.9 4.2 3.2 7.7l3.1 2.4C7.1 7.6 9.3 5.8 12 5.8z" />
                </svg>
                Google
            </span>
        );
    }
    return <span className="text-xs text-white font-medium capitalize">{normalized}</span>;
}

const ProfilePage = () => {
    const { user, token, updateUser } = useAuthStore();
    const { showToast } = useToastStore();
    const cachedExport = token ? authApi.peekExportUserData(token) : null;
    const cachedDocs = token ? documentsApi.peekList(token, { page: 1, per_page: 120 }) : null;
    const role = user?.role || cachedExport?.profile?.role || 'student';
    const isStudent = role === 'student';
    const isFaculty = role === 'faculty';
    const isAdmin = role === 'admin';

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formName, setFormName] = useState(user?.full_name || '');
    const [formDepartment, setFormDepartment] = useState(user?.department || '');
    const [formProgram, setFormProgram] = useState(user?.program || '');
    const [formSemester, setFormSemester] = useState(user?.semester || '');
    const [formSection, setFormSection] = useState(user?.section || '');
    const [formRollNumber, setFormRollNumber] = useState(user?.roll_number || '');
    const [exportData, setExportData] = useState<UserExportData | null>(cachedExport ?? null);
    const [liveDocCount, setLiveDocCount] = useState(cachedDocs?.total || cachedDocs?.documents?.length || 0);
    const [liveNoticeCount, setLiveNoticeCount] = useState(
        (cachedDocs?.documents || []).filter(isNoticeLike).length,
    );
    const [isLoadingStats, setIsLoadingStats] = useState(!(cachedExport || cachedDocs));

    const profileImage = (user as any)?.profileImage || null;
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setFormName(user?.full_name || '');
        setFormDepartment(user?.department || '');
        setFormProgram(user?.program || '');
        setFormSemester(user?.semester || '');
        setFormSection(user?.section || '');
        setFormRollNumber(user?.roll_number || '');
    }, [user?.full_name, user?.department, user?.program, user?.semester, user?.section, user?.roll_number]);

    useEffect(() => {
        let alive = true;
        const loadStats = async () => {
            if (!token) return;
            const needsExport = !cachedExport;
            const needsDocs = !cachedDocs;
            const shouldSilentRefresh = false;

            if (!shouldSilentRefresh) setIsLoadingStats(true);
            try {
                const [exportResult, docsResult] = await Promise.allSettled([
                    needsExport
                        ? authApi.exportUserData(token)
                        : Promise.resolve(cachedExport),
                    needsDocs
                        ? documentsApi.list(token, { page: 1, per_page: 120 })
                        : Promise.resolve(cachedDocs),
                ]);

                const payload = exportResult.status === 'fulfilled' ? exportResult.value : null;
                const docs = docsResult.status === 'fulfilled' ? docsResult.value : null;

                if (!alive) return;

                const docRows = docs?.documents || [];
                const docsTotal = Number(docs?.total || docRows.length || 0);
                const now = Date.now();
                const notices30d = docRows.filter((doc) => {
                    if (!isNoticeLike(doc)) return false;
                    const raw = doc.uploaded_at || doc.created_at;
                    if (!raw) return false;
                    const when = new Date(raw).getTime();
                    if (!Number.isFinite(when) || when <= 0) return false;
                    return (now - when) <= 30 * 24 * 60 * 60 * 1000;
                }).length;

                setLiveDocCount(Math.max(0, docsTotal));
                setLiveNoticeCount(Math.max(0, notices30d));
                if (payload) setExportData(payload);
            } catch {
                if (!alive) return;
                if (needsDocs && !cachedDocs && !shouldSilentRefresh) {
                    setLiveDocCount(0);
                    setLiveNoticeCount(0);
                }
                if (needsExport && !cachedExport && !shouldSilentRefresh) setExportData(null);
            } finally {
                if (alive) setIsLoadingStats(false);
            }
        };
        loadStats();
        return () => {
            alive = false;
        };
    }, [token]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const img = ev.target?.result as string;
            updateUser({ profileImage: img, avatar_url: img } as any);
            if (token) {
                try {
                    await authApi.updateProfile(token, { avatar_url: img });
                } catch {
                    // Keep optimistic local preview even if backend write fails.
                }
            }
            showToast('Profile image updated across your account.', 'success');
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        if (!token) {
            showToast('Please login again to save profile.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            const payload = await authApi.updateProfile(token, {
                full_name: formName.trim() || user?.full_name || 'User',
                department: formDepartment.trim(),
                program: isStudent || isFaculty ? formProgram.trim() : '',
                semester: isStudent ? formSemester.trim() : '',
                section: isStudent ? formSection.trim() : '',
                roll_number: isStudent ? formRollNumber.trim() : '',
                avatar_url: (user as any)?.avatar_url ?? profileImage ?? null,
            });
            updateUser({
                full_name: payload.full_name,
                department: payload.department || '',
                program: isStudent || isFaculty ? payload.program || '' : '',
                semester: isStudent ? payload.semester || '' : '',
                section: isStudent ? payload.section || '' : '',
                roll_number: isStudent ? payload.roll_number || '' : '',
                avatar_url: payload.avatar_url ?? null,
                profileImage: payload.avatar_url ?? null,
            });
            setIsEditing(false);
            showToast('Profile details saved.', 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to save profile details.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setFormName(user?.full_name || '');
        setFormDepartment(user?.department || '');
        setFormProgram(user?.program || '');
        setFormSemester(user?.semester || '');
        setFormSection(user?.section || '');
        setFormRollNumber(user?.roll_number || '');
        setIsEditing(false);
    };

    const profileRows = [
        { icon: Mail, label: 'Email', value: user?.email || 'Not set' },
        { icon: Shield, label: 'Role', value: role.toUpperCase() },
        {
            icon: Calendar,
            label: 'Member Since',
            value: user?.created_at
                ? new Date(user.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                  })
                : 'Not available',
        },
        {
            icon: CheckCircle2,
            label: 'Academic Verification',
            value: user?.academic_verified ? 'Verified' : 'Pending',
        },
    ];

    const academicRows = [
        ...(isStudent
            ? [
                  { icon: GraduationCap, label: 'Program', value: user?.program || 'Not specified' },
                  { icon: Layers, label: 'Semester', value: user?.semester || 'Not specified' },
                  { icon: BookOpen, label: 'Section', value: user?.section || 'Not specified' },
                  { icon: Hash, label: 'Roll Number', value: user?.roll_number || 'Not specified' },
              ]
            : []),
        ...(isFaculty
            ? [
                  { icon: GraduationCap, label: 'Teaching Area', value: user?.program || 'Not specified' },
                  { icon: Building, label: 'Department', value: user?.department || 'Not specified' },
              ]
            : []),
        ...(isAdmin
            ? [
                  { icon: Shield, label: 'Access Level', value: 'Administrator' },
                  { icon: Building, label: 'Admin Unit', value: user?.department || 'Not specified' },
              ]
            : []),
    ];

    const detailPanelTitle = isStudent
        ? 'Academic Details'
        : isFaculty
          ? 'Faculty Details'
          : 'Admin Details';

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6 pb-24">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative rounded-3xl border border-white/[0.08] bg-[linear-gradient(118deg,rgba(18,18,22,0.98),rgba(28,22,18,0.97),rgba(42,28,18,0.95))] overflow-hidden shadow-[0_24px_80px_-48px_rgba(0,0,0,0.9)]"
                >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.10),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.08),transparent_34%)] pointer-events-none" />
                    <div className="absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/30 to-transparent pointer-events-none" />

                    <div className="relative z-10 px-5 sm:px-7 py-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1 min-w-0">
                            <div className="relative group shrink-0">
                                <div className="w-24 h-24 rounded-full overflow-hidden border border-white/10 bg-zinc-950 shadow-[0_18px_38px_-24px_rgba(0,0,0,0.95)]">
                                    <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-[linear-gradient(145deg,rgba(28,29,35,0.98),rgba(12,12,16,0.98))]">
                                        {profileImage ? (
                                            <img src={profileImage} alt="Profile" className="w-full h-full object-cover object-center scale-[1.28]" />
                                        ) : (
                                            <span className="text-3xl font-black text-orange-200">
                                                {user?.full_name?.charAt(0) || 'U'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                />
                            </div>

                            <div className="flex-1 min-w-0 space-y-3">
                                <div className="min-w-0">
                                    <h1 className="text-xl md:text-2xl font-extrabold text-white truncate">
                                        {user?.full_name || 'User'}
                                    </h1>
                                    <p className="text-xs text-zinc-500 truncate mt-1">{user?.email || 'No email'}</p>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <Badge className={`text-[10px] border px-2.5 py-1 capitalize ${roleBadgeStyles[role]}`}>
                                            {role}
                                        </Badge>
                                        {user?.academic_verified && (
                                            <Badge className="text-[10px] border px-2.5 py-1 bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                                Academic Verified
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {isEditing && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="h-10 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                                        >
                                            <Camera className="w-4 h-4 mr-2" />
                                            Change Picture
                                        </Button>
                                        {profileImage && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={async () => {
                                                    updateUser({ profileImage: null, avatar_url: null } as any);
                                                    if (token) {
                                                        try {
                                                            await authApi.updateProfile(token, { avatar_url: null });
                                                        } catch {
                                                            // Keep local reset even if backend write fails.
                                                        }
                                                    }
                                                    showToast('Profile image removed.', 'success');
                                                }}
                                                className="h-10 px-4 rounded-xl border-white/12 bg-white/[0.03] text-zinc-100 hover:border-white/20 hover:bg-white/[0.06]"
                                            >
                                                <X className="w-4 h-4 mr-2" />
                                                Remove Picture
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div
                            className={`w-full lg:w-auto shrink-0 ${
                                isEditing
                                    ? 'lg:self-stretch lg:min-h-[8.5rem] lg:flex lg:flex-col lg:justify-end'
                                    : 'lg:self-center'
                            }`}
                        >
                            {!isEditing ? (
                                <div className="flex justify-start lg:justify-end items-center">
                                    <Button
                                        onClick={() => setIsEditing(true)}
                                        className="h-10 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                                    >
                                        <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-wrap justify-start lg:justify-end items-center gap-2">
                                    <Button
                                        onClick={handleCancel}
                                        variant="outline"
                                        className="h-10 px-4 rounded-xl text-white border-white/12 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white shadow-[0_10px_28px_-18px_rgba(249,115,22,0.85)]"
                                    >
                                        <Save className="w-4 h-4 mr-1.5" /> {isSaving ? 'Saving...' : 'Save'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="space-y-5 lg:col-span-7 h-full"
                    >
                        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5">
                            <h2 className="text-sm font-semibold text-white mb-4">Personal Information</h2>
                            <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-1.5">
                                <label className="text-[11px] text-zinc-500">Full Name</label>
                                {isEditing ? (
                                    <input
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        className="h-10 rounded-xl border border-white/[0.1] bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/35"
                                    />
                                ) : (
                                    <div className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 flex items-center text-sm text-white">
                                        {user?.full_name || 'User'}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-1.5">
                                <label className="text-[11px] text-zinc-500">Department</label>
                                {isEditing ? (
                                    <input
                                        value={formDepartment}
                                        onChange={(e) => setFormDepartment(e.target.value)}
                                        className="h-10 rounded-xl border border-white/[0.1] bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/35"
                                        placeholder="Computer Science"
                                    />
                                ) : (
                                    <div className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 flex items-center text-sm text-white">
                                        {user?.department || 'Not specified'}
                                    </div>
                                )}
                            </div>

                            {(isStudent || isFaculty) && (
                                <div className="grid grid-cols-1 gap-1.5">
                                    <label className="text-[11px] text-zinc-500">
                                        {isFaculty ? 'Teaching Area' : 'Program'}
                                    </label>
                                    {isEditing ? (
                                        <input
                                            value={formProgram}
                                            onChange={(e) => setFormProgram(e.target.value)}
                                            className="h-10 rounded-xl border border-white/[0.1] bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/35"
                                            placeholder={isFaculty ? 'Computer Science / AI' : 'BTech CSE'}
                                        />
                                    ) : (
                                        <div className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 flex items-center text-sm text-white">
                                            {user?.program || 'Not specified'}
                                        </div>
                                    )}
                                </div>
                            )}

                            {isStudent && (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="grid grid-cols-1 gap-1.5">
                                            <label className="text-[11px] text-zinc-500">Semester</label>
                                            {isEditing ? (
                                                <input
                                                    value={formSemester}
                                                    onChange={(e) => setFormSemester(e.target.value)}
                                                    className="h-10 rounded-xl border border-white/[0.1] bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/35"
                                                    placeholder="4"
                                                />
                                            ) : (
                                                <div className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 flex items-center text-sm text-white">
                                                    {user?.semester || 'Not specified'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-1.5">
                                            <label className="text-[11px] text-zinc-500">Section</label>
                                            {isEditing ? (
                                                <input
                                                    value={formSection}
                                                    onChange={(e) => setFormSection(e.target.value)}
                                                    className="h-10 rounded-xl border border-white/[0.1] bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/35"
                                                    placeholder="A"
                                                />
                                            ) : (
                                                <div className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 flex items-center text-sm text-white">
                                                    {user?.section || 'Not specified'}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-1.5">
                                        <label className="text-[11px] text-zinc-500">Roll Number</label>
                                        {isEditing ? (
                                            <input
                                                value={formRollNumber}
                                                onChange={(e) => setFormRollNumber(e.target.value)}
                                                className="h-10 rounded-xl border border-white/[0.1] bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/35"
                                                placeholder="230101029"
                                            />
                                        ) : (
                                            <div className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 flex items-center text-sm text-white">
                                                {user?.roll_number || 'Not specified'}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                                {profileRows.map((row) => (
                                    <div
                                        key={row.label}
                                        className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-2 text-zinc-500 text-xs">
                                            <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${iconToneByLabel[row.label] || 'text-zinc-300 bg-white/10 border-white/15'}`}>
                                                <row.icon className="w-3 h-3" />
                                            </span>
                                            {row.label}
                                        </div>
                                        <span className="text-xs text-white font-medium">{row.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="space-y-5 lg:col-span-5 h-full flex flex-col"
                    >
                        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 flex-1">
                            <h2 className="text-sm font-semibold text-white mb-4">{detailPanelTitle}</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {academicRows.map((row) => (
                                    <div
                                        key={row.label}
                                        className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
                                    >
                                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                            <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${iconToneByLabel[row.label] || 'text-zinc-300 bg-white/10 border-white/15'}`}>
                                                <row.icon className="w-3 h-3" />
                                            </span>
                                            {row.label}
                                        </div>
                                        <div className="text-sm font-semibold text-white mt-1.5 break-words">
                                            {row.value}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                    <span className="w-5 h-5 rounded-md border border-cyan-500/30 text-cyan-300 bg-cyan-500/15 flex items-center justify-center">
                                        <Building className="w-3 h-3" />
                                    </span>
                                    Identity Provider
                                </div>
                                <ProviderBadge provider={user?.identity_provider || 'email'} />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5">
                            <h2 className="text-sm font-semibold text-white mb-4">Account Activity Snapshot</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {statItems(exportData, liveDocCount, liveNoticeCount).map((stat) => (
                                    <div
                                        key={stat.label}
                                        className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
                                    >
                                        <div className="min-h-[32px] flex items-start gap-2 text-[11px] text-zinc-500">
                                            <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${iconToneByLabel[stat.label] || 'text-zinc-300 bg-white/10 border-white/15'}`}>
                                                <stat.icon className="w-3 h-3" />
                                            </span>
                                            {stat.label}
                                        </div>
                                        <div className="mt-3 h-8 flex items-end pb-0.5 text-[22px] leading-none font-bold tracking-tight tabular-nums text-white">
                                            {isLoadingStats ? <Skeleton className="h-6 w-14" /> : stat.value}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.14 }}
                        className="lg:col-span-12 grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5 items-stretch"
                    >
                        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 h-full">
                            <h2 className="text-sm font-semibold text-white mb-4">Account Presence</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${iconToneByLabel['Member Since']}`}>
                                            <Calendar className="w-3 h-3" />
                                        </span>
                                        Joined
                                    </div>
                                    <div className="text-sm font-semibold text-white mt-1.5">
                                        {user?.created_at
                                            ? new Date(user.created_at).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                            })
                                            : 'Not available'}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${iconToneByLabel['Academic Verification']}`}>
                                            <CheckCircle2 className="w-3 h-3" />
                                        </span>
                                        Verification
                                    </div>
                                    <div className="text-sm font-semibold text-white mt-1.5">
                                        {user?.academic_verified ? 'Verified' : 'Pending'}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 sm:col-span-2">
                                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${iconToneByLabel['Recent Notices']}`}>
                                            <Bell className="w-3 h-3" />
                                        </span>
                                        Last Snapshot Refresh
                                    </div>
                                    <div className="text-sm font-semibold text-white mt-1.5">
                                        {exportData?.exportDate
                                            ? new Date(exportData.exportDate).toLocaleString('en-US', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })
                                            : 'Waiting for latest sync'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 h-full">
                            <h2 className="text-sm font-semibold text-white mb-4">Access Summary</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full content-start">
                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${iconToneByLabel['Accessible Docs']}`}>
                                            <FileText className="w-3 h-3" />
                                        </span>
                                        Documents In Scope
                                    </div>
                                    <div className="text-sm font-semibold text-white mt-1.5">
                                        {isLoadingStats ? <Skeleton className="h-5 w-14" /> : liveDocCount}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${iconToneByLabel['Recent Notices']}`}>
                                            <Bell className="w-3 h-3" />
                                        </span>
                                        Notice Reach
                                    </div>
                                    <div className="text-sm font-semibold text-white mt-1.5">
                                        {isLoadingStats ? <Skeleton className="h-5 w-14" /> : liveNoticeCount}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                        <span className="w-5 h-5 rounded-md border border-orange-500/30 text-orange-300 bg-orange-500/15 flex items-center justify-center">
                                            <Building className="w-3 h-3" />
                                        </span>
                                        Identity Mode
                                    </div>
                                    <div className="text-sm font-semibold text-white mt-1.5 capitalize">
                                        {user?.identity_provider || 'email'}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                                    <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Primary Scope</div>
                                    <div className="text-sm font-semibold text-white mt-1.5">
                                        {user?.department || user?.program || 'Not specified'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;


