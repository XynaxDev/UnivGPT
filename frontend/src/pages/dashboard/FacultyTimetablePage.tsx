/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Clock3, MapPin } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

type TimetableSlot = {
    day: string;
    start: string;
    end: string;
    course: string;
    room: string;
    type: string;
};

const WEEKLY_TIMETABLE: TimetableSlot[] = [
    { day: 'Mon', start: '09:00', end: '10:00', course: 'CS301 Data Structures', room: 'Room RL-301', type: 'Lecture' },
    { day: 'Mon', start: '14:00', end: '15:00', course: 'AI405 Applied ML', room: 'Lab ML-2', type: 'Lab' },
    { day: 'Tue', start: '11:00', end: '12:00', course: 'CS402 DBMS', room: 'Room RL-204', type: 'Lecture' },
    { day: 'Wed', start: '10:00', end: '11:00', course: 'CS301 Data Structures', room: 'Room RL-301', type: 'Tutorial' },
    { day: 'Thu', start: '13:00', end: '14:00', course: 'AI405 Applied ML', room: 'Lab ML-2', type: 'Lab' },
    { day: 'Fri', start: '12:00', end: '13:00', course: 'CS402 DBMS', room: 'Room RL-204', type: 'Lecture' },
];

const normalizeDisplayName = (fullName?: string | null) => {
    const raw = String(fullName || '').trim();
    if (!raw) return 'Faculty';
    const stripped = raw.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').trim();
    return stripped || 'Faculty';
};

const groupByDay = (slots: TimetableSlot[]) => {
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return order
        .map((day) => ({
            day,
            slots: slots.filter((slot) => slot.day === day),
        }))
        .filter((item) => item.slots.length > 0);
};

export default function FacultyTimetablePage() {
    const { user } = useAuthStore();
    const displayName = normalizeDisplayName(user?.full_name);
    const grouped = useMemo(() => groupByDay(WEEKLY_TIMETABLE), []);

    return (
        <div className="h-full overflow-y-auto p-6 md:p-8 w-full">
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-r from-zinc-900 via-zinc-900/95 to-slate-900/80 p-6">
                    <div className="absolute -top-20 right-6 w-64 h-64 bg-cyan-400/10 blur-[90px] rounded-full pointer-events-none" />
                    <div className="absolute -bottom-16 left-8 w-56 h-56 bg-orange-500/10 blur-[90px] rounded-full pointer-events-none" />
                    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                                <CalendarDays className="w-3.5 h-3.5 text-orange-400" /> Faculty Timetable
                            </div>
                            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                                Weekly Schedule for <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">{displayName}</span>
                            </h1>
                            <p className="text-zinc-400 text-sm max-w-2xl">
                                Dedicated teaching timetable view with day-wise class slots and room mapping.
                            </p>
                        </div>
                        <Link to="/dashboard">
                            <Button variant="outline" className="h-11 rounded-2xl px-5 text-zinc-200 border-white/15 hover:text-white text-sm">
                                Back To Faculty Dashboard
                            </Button>
                        </Link>
                    </div>
                </header>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    {grouped.map((group, idx) => (
                        <motion.section
                            key={group.day}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5"
                        >
                            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                <Clock3 className="w-4 h-4 text-orange-400" /> {group.day}
                            </h2>
                            <div className="space-y-2">
                                {group.slots.map((slot) => (
                                    <div key={`${slot.day}-${slot.start}-${slot.course}`} className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-semibold text-white truncate">{slot.course}</p>
                                            <span className="text-xs font-semibold text-zinc-300 shrink-0">
                                                {slot.start} - {slot.end}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-500">
                                            <MapPin className="w-3.5 h-3.5 text-zinc-600" />
                                            {slot.room} • {slot.type}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.section>
                    ))}
                </div>
            </div>
        </div>
    );
}

