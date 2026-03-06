import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { UserCircle, Mail, Shield, Calendar, Building, Edit2, Camera, X, Check, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';

const ProfilePage = () => {
    const { user, updateUser } = useAuthStore();
    const { showToast } = useToastStore();
    const [isEditing, setIsEditing] = useState(false);
    const profileImage = user?.profileImage || null;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formName, setFormName] = useState(user?.full_name || '');
    const [formDept, setFormDept] = useState(user?.department || '');

    const roleColors: Record<string, string> = {
        student: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
        faculty: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
        admin: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = ev.target?.result as string;
                // Store in auth store so it shows everywhere
                updateUser({ profileImage: img });
                showToast("Profile image updated", "success");
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        // Update Zustand store so changes reflect everywhere
        updateUser({
            full_name: formName,
            department: formDept,
        });
        showToast("Profile settings saved", "success");
        setIsEditing(false);
    };

    const handleCancel = () => {
        setFormName(user?.full_name || '');
        setFormDept(user?.department || '');
        setIsEditing(false);
    };

    const fields = [
        {
            icon: UserCircle, label: 'Full Name',
            value: user?.full_name || 'N/A',
            editable: true,
            editValue: formName,
            onChange: setFormName,
        },
        {
            icon: Mail, label: 'Email',
            value: user?.email || 'N/A',
            editable: false,
        },
        {
            icon: Shield, label: 'Role',
            value: user?.role || 'student',
            editable: false,
            capitalize: true,
        },
        {
            icon: Building, label: 'Department',
            value: user?.department || 'Not specified',
            editable: true,
            editValue: formDept,
            onChange: setFormDept,
            placeholder: 'e.g. Computer Science',
        },
        {
            icon: Calendar, label: 'Member Since',
            value: user?.created_at
                ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : 'N/A',
            editable: false,
        },
    ];

    return (
        <div className="p-6 md:p-8 space-y-5 max-w-3xl mx-auto pb-24">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                {/* Profile Header */}
                <div className="relative rounded-2xl bg-zinc-900/40 border border-white/[0.06] overflow-hidden mb-5">
                    {/* Banner */}
                    <div className="h-24 bg-gradient-to-r from-orange-600/20 via-amber-600/10 to-transparent" />

                    {/* Avatar + Info */}
                    <div className="px-5 sm:px-6 pb-5 -mt-10 flex flex-col sm:flex-row items-center sm:items-end gap-3 sm:gap-4 text-center sm:text-left">
                        <div className="relative group">
                            <div className={cn(
                                "w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 p-1 shadow-xl transition-all duration-500",
                                isEditing && "animate-pulse ring-4 ring-orange-500/10"
                            )}>
                                <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center overflow-hidden border border-white/[0.05]">
                                    {profileImage ? (
                                        <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-2xl font-bold text-orange-400">{user?.full_name?.charAt(0) || 'U'}</span>
                                    )}
                                </div>
                            </div>
                            {isEditing && (
                                <>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="absolute inset-0 rounded-full bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center opacity-100 group-hover:bg-black/60 transition-all cursor-pointer z-10 border-2 border-dashed border-white/20 group-hover:border-orange-500/50"
                                    >
                                        <Camera className="w-5 h-5 text-white mb-1" />
                                        <span className="text-[8px] font-bold text-white uppercase tracking-tighter">Change</span>
                                    </button>
                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                    {profileImage && (
                                        <button onClick={() => { updateUser({ profileImage: null }); showToast("Photo removed", "success"); }} className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white opacity-100 transition-opacity z-20 shadow-xl border-2 border-black">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="flex-1 min-w-0 pb-0.5 w-full">
                            <h1 className="text-lg font-bold text-white truncate">{user?.full_name || 'User'}</h1>
                            <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
                            <Badge className={`text-[9px] font-semibold px-2 py-0.5 border capitalize mt-1.5 ${roleColors[user?.role || 'student']}`}>
                                {user?.role || 'student'}
                            </Badge>
                        </div>
                        <div className="pb-0.5 w-full sm:w-auto mt-2 sm:mt-0">
                            {!isEditing ? (
                                <Button
                                    onClick={() => setIsEditing(true)}
                                    className="h-9 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-white border border-white/10 px-5 transition-all active:scale-95"
                                >
                                    <Edit2 className="w-3.5 h-3.5 mr-2" />
                                    Edit Profile
                                </Button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Button
                                        onClick={handleCancel}
                                        variant="glass"
                                        className="h-9 flex-1 sm:flex-none rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02] px-5 transition-all active:scale-95 border border-transparent hover:border-white/5"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleSave}
                                        className="h-9 flex-1 sm:flex-none rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-500 px-4 transition-all hover:shadow-lg hover:shadow-orange-500/20 active:scale-95 text-white"
                                    >
                                        Save
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Profile Details */}
                <div className="rounded-2xl bg-zinc-900/40 border border-white/[0.06] overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/[0.05]">
                        <span className="text-xs font-semibold text-white">Profile Details</span>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                        {fields.map(field => (
                            <div key={field.label} className="flex items-center justify-between px-5 py-3.5">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <field.icon className="w-4 h-4 text-zinc-600 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">{field.label}</div>
                                        {isEditing && field.editable ? (
                                            <input
                                                value={field.editValue}
                                                onChange={e => field.onChange?.(e.target.value)}
                                                placeholder={field.placeholder}
                                                className="mt-0.5 h-8 px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs outline-none focus:border-orange-500/30 w-full max-w-xs"
                                            />
                                        ) : (
                                            <div className={`text-xs font-medium text-white mt-0.5 ${field.capitalize ? 'capitalize' : ''}`}>
                                                {field.value}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {isEditing && !field.editable && field.label === 'Email' && (
                                    <span className="text-[9px] text-zinc-600 shrink-0">Cannot change</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Activity Summary */}
                <div className="rounded-2xl bg-zinc-900/40 border border-white/[0.06] p-5 mt-5">
                    <span className="text-xs font-semibold text-white block mb-4">Activity Summary</span>
                    <div className="grid grid-cols-2 xs:grid-cols-3 gap-3">
                        {[
                            { label: 'Total Queries', value: '124' },
                            { label: 'Documents', value: '38' },
                            { label: 'Sessions', value: '67' },
                        ].map(item => (
                            <div key={item.label} className="p-3 sm:p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center hover:bg-white/[0.04] hover:border-white/[0.08] transition-all">
                                <div className="text-lg font-bold text-white">{item.value}</div>
                                <div className="text-[9px] text-zinc-500 uppercase tracking-wider mt-1">{item.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default ProfilePage;
