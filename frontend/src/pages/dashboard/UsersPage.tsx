import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Search, Edit2, X, Check, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { adminApi, type UserProfile } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';

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
    const { token } = useAuthStore();
    const { showToast } = useToastStore();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

    const [formName, setFormName] = useState('');
    const [formRole, setFormRole] = useState<RoleType>('student');
    const [formDept, setFormDept] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const loadUsers = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const res = await adminApi.getUsers(token, 1, 200);
            setUsers(res.users || []);
        } catch (err: any) {
            showToast(err?.message || 'Failed to load users from database.', 'error');
            setUsers([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

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

    return (
        <div className="h-full overflow-y-auto p-5 md:p-8 space-y-6 max-w-7xl mx-auto pb-20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/90 to-zinc-900/40 p-5">
                <div>
                    <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-orange-400" /> User Management
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">
                        {isLoading ? 'Syncing users...' : `${filtered.length} users found`}
                    </p>
                </div>
                <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 w-full sm:w-auto">
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
                        onClick={loadUsers}
                        className="h-10 rounded-xl bg-orange-600 hover:bg-orange-500 text-xs font-bold px-5 transition-all hover:shadow-lg hover:shadow-orange-500/20 active:scale-95 text-white"
                        disabled={isLoading}
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
                    {!isLoading && filtered.length === 0 && (
                        <div className="px-5 py-10 text-sm text-zinc-500">No users found in the database.</div>
                    )}
                    {paginatedUsers.map((user, idx) => {
                        const role = roleValue(user.role);
                        const status = statusFromProfile(user);
                        return (
                            <motion.div
                                key={user.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: idx * 0.02 }}
                                className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_80px_80px_90px_70px] gap-2 sm:gap-3 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center shrink-0">
                                        <span className="text-[10px] font-bold text-orange-400">
                                            {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-xs font-medium text-white truncate">{user.full_name || 'User'}</div>
                                        <div className="text-[10px] text-zinc-600 truncate">{user.email || 'No email'}</div>
                                    </div>
                                </div>
                                <span className="text-xs text-zinc-400 truncate">{user.department || 'Not set'}</span>
                                <Badge className={`text-[9px] font-semibold px-2 py-0.5 border capitalize w-fit ${roleColors[role]}`}>
                                    {role}
                                </Badge>
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                                    <span className="text-[10px] text-zinc-500 capitalize">{status}</span>
                                </div>
                                <span className="text-[10px] text-zinc-600">{formatJoined(user.created_at)}</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEditModal(user)}
                                        className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center text-zinc-600 hover:text-orange-400 transition-colors"
                                        title="Edit user"
                                    >
                                        <Edit2 className="w-3 h-3" />
                                    </button>
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
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.02] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] text-xs font-medium"
                        >
                            Prev
                        </button>
                        {Array.from({ length: totalPages }).map((_, idx) => {
                            const page = idx + 1;
                            const active = page === currentPage;
                            return (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={`h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-colors ${
                                        active
                                            ? 'bg-orange-600 text-white'
                                            : 'border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.08]'
                                    }`}
                                >
                                    {page}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
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
