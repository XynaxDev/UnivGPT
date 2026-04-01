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
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { authApi, type UserExportData } from '@/lib/api';

const roleBadgeStyles: Record<string, string> = {
    student: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    faculty: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    admin: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
};

const statItems = (data: UserExportData | null) => [
    {
        label: 'Total Queries',
        value: data ? String(data.queries) : '--',
        icon: BarChart3,
    },
    {
        label: 'Accessible Docs',
        value: data ? String(data.documents) : '--',
        icon: FileText,
    },
    {
        label: 'Recent Notices',
        value: data ? String(data.notices) : '--',
        icon: Bell,
    },
];

const ProfilePage = () => {
    const { user, token, updateUser } = useAuthStore();
    const { showToast } = useToastStore();

    const [isEditing, setIsEditing] = useState(false);
    const [formName, setFormName] = useState(user?.full_name || '');
    const [formDepartment, setFormDepartment] = useState(user?.department || '');
    const [exportData, setExportData] = useState<UserExportData | null>(null);
    const [isLoadingStats, setIsLoadingStats] = useState(false);

    const profileImage = (user as any)?.profileImage || null;
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setFormName(user?.full_name || '');
        setFormDepartment(user?.department || '');
    }, [user?.full_name, user?.department]);

    useEffect(() => {
        let alive = true;
        const loadStats = async () => {
            if (!token) return;
            setIsLoadingStats(true);
            try {
                const payload = await authApi.exportUserData(token);
                if (!alive) return;
                setExportData(payload);
            } catch {
                if (!alive) return;
                setExportData(null);
            } finally {
                if (alive) setIsLoadingStats(false);
            }
        };
        loadStats();
        return () => {
            alive = false;
        };
    }, [token]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = ev.target?.result as string;
            updateUser({ profileImage: img } as any);
            showToast('Profile image updated.', 'success');
        };
        reader.readAsDataURL(file);
    };

    const handleSave = () => {
        updateUser({
            full_name: formName.trim() || user?.full_name || 'User',
            department: formDepartment.trim(),
        });
        setIsEditing(false);
        showToast('Profile details saved.', 'success');
    };

    const handleCancel = () => {
        setFormName(user?.full_name || '');
        setFormDepartment(user?.department || '');
        setIsEditing(false);
    };

    const profileRows = [
        { icon: Mail, label: 'Email', value: user?.email || 'Not set' },
        { icon: Shield, label: 'Role', value: (user?.role || 'student').toUpperCase() },
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
        { icon: GraduationCap, label: 'Program', value: user?.program || 'Not specified' },
        { icon: Layers, label: 'Semester', value: user?.semester || 'Not specified' },
        { icon: BookOpen, label: 'Section', value: user?.section || 'Not specified' },
        { icon: Hash, label: 'Roll Number', value: user?.roll_number || 'Not specified' },
    ];

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6 pb-24">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/90 to-zinc-900/40 overflow-hidden"
                >
                    <div className="h-24 bg-gradient-to-r from-orange-600/25 via-amber-500/10 to-transparent" />

                    <div className="px-5 sm:px-7 pb-6 -mt-10 flex flex-col md:flex-row md:items-end gap-4">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-2xl p-1 bg-gradient-to-br from-orange-500 to-amber-500 shadow-xl">
                                <div className="w-full h-full rounded-[14px] bg-zinc-950 border border-white/[0.08] overflow-hidden flex items-center justify-center">
                                    {profileImage ? (
                                        <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-3xl font-black text-orange-400">
                                            {user?.full_name?.charAt(0) || 'U'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {isEditing && (
                                <>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="absolute inset-0 rounded-2xl bg-black/50 border border-white/20 flex items-center justify-center text-white"
                                    >
                                        <Camera className="w-5 h-5" />
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                    />
                                    {profileImage && (
                                        <button
                                            onClick={() => {
                                                updateUser({ profileImage: null } as any);
                                                showToast('Profile image removed.', 'success');
                                            }}
                                            className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center border-2 border-zinc-950"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl md:text-2xl font-extrabold text-white truncate">
                                {user?.full_name || 'User'}
                            </h1>
                            <p className="text-xs text-zinc-500 truncate mt-1">{user?.email || 'No email'}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Badge className={`text-[10px] border px-2.5 py-1 capitalize ${roleBadgeStyles[user?.role || 'student']}`}>
                                    {user?.role || 'student'}
                                </Badge>
                                {user?.academic_verified && (
                                    <Badge className="text-[10px] border px-2.5 py-1 bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                        Academic Verified
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <div className="w-full md:w-auto">
                            {!isEditing ? (
                                <Button
                                    onClick={() => setIsEditing(true)}
                                    className="h-10 px-5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white"
                                >
                                    <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button
                                        onClick={handleCancel}
                                        variant="outline"
                                        className="h-10 px-4 rounded-xl text-white border-white/20 hover:border-white/30"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleSave}
                                        className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white"
                                    >
                                        <Save className="w-4 h-4 mr-1.5" /> Save
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5"
                    >
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

                            {profileRows.map((row) => (
                                <div
                                    key={row.label}
                                    className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-2 text-zinc-500 text-xs">
                                        <row.icon className="w-3.5 h-3.5" /> {row.label}
                                    </div>
                                    <span className="text-xs text-white font-medium">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5"
                    >
                        <h2 className="text-sm font-semibold text-white mb-4">Academic Details</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {academicRows.map((row) => (
                                <div
                                    key={row.label}
                                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
                                >
                                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                        <row.icon className="w-3.5 h-3.5" /> {row.label}
                                    </div>
                                    <div className="text-sm font-semibold text-white mt-1.5 break-words">
                                        {row.value}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                <Building className="w-3.5 h-3.5" /> Identity Provider
                            </div>
                            <span className="text-xs text-white font-medium capitalize">
                                {user?.identity_provider || 'email'}
                            </span>
                        </div>
                    </motion.div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5"
                >
                    <h2 className="text-sm font-semibold text-white mb-4">Account Activity Snapshot</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {statItems(exportData).map((stat) => (
                            <div
                                key={stat.label}
                                className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
                            >
                                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                    <stat.icon className="w-3.5 h-3.5" /> {stat.label}
                                </div>
                                <div className="text-xl font-extrabold text-white mt-2">
                                    {isLoadingStats ? '...' : stat.value}
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default ProfilePage;
