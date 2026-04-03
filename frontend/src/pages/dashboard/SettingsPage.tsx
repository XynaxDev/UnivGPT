import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings, Bell,
    Trash2, AlertTriangle, Download, Eye,
    UserCircle2, ShieldCheck, Building2, GraduationCap, Layers, Hash
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { useToastStore } from '@/store/toastStore';
import { authApi } from '@/lib/api';

/* ─── Toggle Switch ─── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
    return (
        <button
            onClick={onChange}
            className={`w-10 h-[22px] rounded-full p-[3px] transition-colors duration-200 ${checked ? 'bg-orange-500' : 'bg-zinc-700'}`}
        >
            <motion.div
                initial={false}
                animate={{ x: checked ? 18 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="w-4 h-4 rounded-full bg-white"
            />
        </button>
    );
}

const SettingsPage = () => {
    const { logout, user, token } = useAuthStore();
    const { showToast } = useToastStore();
    const navigate = useNavigate();
    const role = user?.role || 'student';
    const isStudent = role === 'student';
    const isFaculty = role === 'faculty';
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);

    const [settings, setSettings] = useState({
        emailNotifications: true,
        pushNotifications: false,
        reducedMotion: false,
    });

    useEffect(() => {
        let active = true;
        const loadSettings = async () => {
            if (!token) {
                setIsLoadingSettings(false);
                return;
            }
            try {
                const res = await authApi.getSettings(token);
                if (!active) return;
                setSettings(res.settings);
            } catch {
                if (!active) return;
                setSettings({
                    emailNotifications: true,
                    pushNotifications: false,
                    reducedMotion: false,
                });
            } finally {
                if (active) setIsLoadingSettings(false);
            }
        };
        loadSettings();
        return () => {
            active = false;
        };
    }, [token]);

    const toggle = (key: keyof typeof settings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirmText === 'DELETE') {
            await logout();
            navigate('/auth/login', { replace: true });
        }
    };

    const handleSaveChanges = async () => {
        if (!token) {
            showToast('Please login again to save settings.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            const res = await authApi.saveSettings(token, settings);
            setSettings(res.settings);
            showToast('Settings saved successfully.', 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to save settings.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportData = async () => {
        if (!token) {
            showToast('Please login again to export data.', 'error');
            return;
        }
        setIsExporting(true);
        try {
            const serverData = await authApi.exportUserData(token);
            const data = {
                ...serverData,
                settings,
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'unigpt-data-export.json';
            a.click();
            URL.revokeObjectURL(url);
            showToast('Exported latest account data.', 'success');
        } catch (err: any) {
            showToast(err.message || 'Failed to export user data.', 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const sections = [
        {
            id: 'notifications', title: 'Notifications', icon: Bell, iconTone: 'text-orange-300 bg-orange-500/15 border-orange-500/30',
            items: [
                { id: 'emailNotifications', label: 'Email Notifications', desc: 'Daily summary and important alerts via email.' },
                { id: 'pushNotifications', label: 'Push Notifications', desc: 'Real-time browser/app notifications.' },
            ]
        },
        {
            id: 'accessibility', title: 'Accessibility', icon: Eye, iconTone: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
            items: [
                { id: 'reducedMotion', label: 'Reduced Motion', desc: 'Minimize UI animations for accessibility.' },
            ]
        },
    ];

    const accountRows = [
        { label: 'Name', value: user?.full_name || 'User', icon: UserCircle2, tone: 'text-sky-300 bg-sky-500/15 border-sky-500/30' },
        { label: 'Role', value: role.charAt(0).toUpperCase() + role.slice(1), icon: ShieldCheck, tone: 'text-orange-300 bg-orange-500/15 border-orange-500/30' },
        { label: 'Department', value: user?.department || 'Not set', icon: Building2, tone: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30' },
        { label: 'Verification', value: user?.academic_verified ? 'Verified' : 'Pending', icon: ShieldCheck, tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
        ...(isStudent
            ? [
                  { label: 'Program', value: user?.program || 'Not set', icon: GraduationCap, tone: 'text-violet-300 bg-violet-500/15 border-violet-500/30' },
                  { label: 'Semester', value: user?.semester || 'Not set', icon: Layers, tone: 'text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-500/30' },
                  { label: 'Section', value: user?.section || 'Not set', icon: Layers, tone: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30' },
                  { label: 'Roll Number', value: user?.roll_number || 'Not set', icon: Hash, tone: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
              ]
            : []),
        ...(isFaculty
            ? [
                  { label: 'Teaching Area', value: user?.program || 'Not set', icon: GraduationCap, tone: 'text-teal-300 bg-teal-500/15 border-teal-500/30' },
              ]
            : []),
    ];

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto pb-24">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/90 to-zinc-900/40 p-5 md:p-6 mb-6">
                    <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2 mb-1">
                        <Settings className="w-5 h-5 text-orange-400" /> Settings
                    </h1>
                    <p className="text-xs text-zinc-400">Manage preferences, security, and account settings from one place.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Main Settings */}
                    <div className="md:col-span-2 space-y-5">
                        {sections.map((sec, si) => (
                            <motion.div
                                key={sec.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: si * 0.08 }}
                                className="rounded-2xl bg-zinc-900/40 border border-white/[0.06] overflow-hidden"
                            >
                                <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center gap-2.5">
                                    <span className={`w-6 h-6 rounded-lg border flex items-center justify-center ${sec.iconTone}`}>
                                        <sec.icon className="w-3.5 h-3.5" />
                                    </span>
                                    <span className="text-sm font-semibold text-white">{sec.title}</span>
                                </div>
                                <div className="divide-y divide-white/[0.04]">
                                    {sec.items.map(item => (
                                        <div key={item.id} className="px-5 py-4 flex items-center justify-between">
                                            <div className="pr-6">
                                                <div className="text-sm font-medium text-white">{item.label}</div>
                                                <div className="text-[11px] text-zinc-500 mt-0.5">{item.desc}</div>
                                            </div>
                                            {isLoadingSettings ? (
                                                <span className="text-[11px] text-zinc-600">Loading...</span>
                                            ) : (
                                                <Toggle
                                                    checked={settings[item.id as keyof typeof settings]}
                                                    onChange={() => toggle(item.id as keyof typeof settings)}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}

                        {/* Data Export */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="rounded-2xl bg-zinc-900/40 border border-white/[0.06] p-5"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <Download className="w-4 h-4 text-orange-400" /> Export Your Data
                                    </h3>
                                    <p className="text-[11px] text-zinc-500 mt-0.5">Download all your data as a JSON file.</p>
                                </div>
                                <Button
                                    onClick={handleExportData}
                                    disabled={isExporting}
                                    className="h-9 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-all hover:shadow-lg hover:shadow-orange-500/20 active:scale-95"
                                >
                                    <Download className="w-3.5 h-3.5 mr-1.5" /> {isExporting ? 'Exporting...' : 'Export'}
                                </Button>
                            </div>
                        </motion.div>

                        {/* Danger Zone — Delete Account */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="rounded-2xl border border-red-500/10 bg-red-500/[0.02] p-5"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                                        <Trash2 className="w-4 h-4" /> Delete Account
                                    </h3>
                                    <p className="text-[11px] text-zinc-500 mt-0.5">Permanently delete your account and all data. This cannot be undone.</p>
                                </div>
                                <Button
                                    onClick={() => setShowDeleteDialog(true)}
                                    className="h-9 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-all hover:shadow-lg hover:shadow-red-500/20 active:scale-95"
                                >
                                    Delete Account
                                </Button>
                            </div>
                        </motion.div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-5">
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="rounded-2xl bg-zinc-900/40 border border-white/[0.06] overflow-hidden"
                        >
                            <div className="px-5 py-3.5 border-b border-white/[0.05]">
                                <span className="text-sm font-semibold text-white">Account</span>
                            </div>
                            <div className="p-4 space-y-2.5">
                                {accountRows.map((row) => (
                                    <div key={row.label} className="flex items-center justify-between gap-3">
                                        <span className="text-[11px] text-zinc-500 flex items-center gap-2 min-w-0">
                                            <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${row.tone}`}>
                                                <row.icon className="w-3 h-3" />
                                            </span>
                                            <span className="truncate">{row.label}</span>
                                        </span>
                                        <span className="text-[11px] font-medium text-white text-right">{row.value}</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        <Button
                            onClick={handleSaveChanges}
                            disabled={isSaving || isLoadingSettings}
                            className="w-full h-10 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white font-semibold transition-all hover:shadow-lg hover:shadow-orange-500/20 active:scale-[0.98]"
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </div>
            </motion.div>

            {/* Delete Account Confirmation Dialog */}
            <AnimatePresence>
                {showDeleteDialog && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
                        onClick={() => setShowDeleteDialog(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 12 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 12 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl p-6 space-y-5"
                        >
                            <div className="flex flex-col items-center text-center gap-3">
                                <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                    <AlertTriangle className="w-7 h-7 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">Delete Your Account?</h3>
                                    <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                                        This will permanently delete your account, all your data, queries, and documents. This action <span className="text-red-400 font-semibold">cannot be undone</span>.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium block mb-1.5">
                                    Type DELETE to confirm
                                </label>
                                <input
                                    value={deleteConfirmText}
                                    onChange={e => setDeleteConfirmText(e.target.value)}
                                    placeholder="DELETE"
                                    className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm outline-none focus:border-red-500/30 placeholder:text-zinc-700 font-mono tracking-wider"
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(''); }}
                                    variant="outline"
                                    className="flex-1 h-10 rounded-xl text-xs font-semibold border-white/10 hover:bg-white/[0.08] hover:border-white/[0.2] transition-all active:scale-[0.98] text-white hover:text-white"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleDeleteAccount}
                                    disabled={deleteConfirmText !== 'DELETE'}
                                    className="flex-1 h-10 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-red-500/20 active:scale-[0.98]"
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Forever
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            </div>
        </div>
    );
};

export default SettingsPage;
