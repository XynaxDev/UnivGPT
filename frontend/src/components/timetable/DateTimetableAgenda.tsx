/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, Coffee, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    TIME_COLUMNS,
    formatTimetableTime,
    getTimetableSlot,
    type TimetableSlot,
    type TimetableSlotType,
} from '@/lib/timetable';

const dayShortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const dayLongNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const surfaceByType: Record<TimetableSlotType, string> = {
    lecture: 'border-sky-300/40 bg-sky-400/10 text-sky-50',
    tutorial: 'border-orange-300/40 bg-orange-400/10 text-orange-50',
    lab: 'border-emerald-300/40 bg-emerald-400/10 text-emerald-50',
};

const badgeByType: Record<TimetableSlotType, string> = {
    lecture: 'border-sky-300/35 bg-sky-400/18 text-sky-100',
    tutorial: 'border-orange-300/35 bg-orange-400/18 text-orange-100',
    lab: 'border-emerald-300/35 bg-emerald-400/18 text-emerald-100',
};

function addDays(date: Date, amount: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
}

function getWeekStart(date: Date) {
    const next = new Date(date);
    const day = next.getDay();
    const mondayDelta = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + mondayDelta);
    next.setHours(0, 0, 0, 0);
    return next;
}

function isSameDay(a: Date, b: Date) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function toneFor(type: TimetableSlotType) {
    return surfaceByType[type] || 'border-white/10 bg-white/[0.03] text-white';
}

function badgeToneFor(type: TimetableSlotType) {
    return badgeByType[type] || 'border-white/10 bg-white/[0.04] text-zinc-200';
}

type DateTimetableAgendaProps = {
    slots: TimetableSlot[];
    title: string;
    subtitle: string;
    emptyMessage: string;
    action?: ReactNode;
    className?: string;
};

export function DateTimetableAgenda({
    slots,
    title,
    subtitle,
    emptyMessage,
    action,
    className,
}: DateTimetableAgendaProps) {
    const [selectedDate, setSelectedDate] = useState(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    });

    const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)),
        [weekStart],
    );

    const selectedShortDay = dayShortNames[selectedDate.getDay()];
    const selectedLongDay = dayLongNames[selectedDate.getDay()];
    const isWeekend = selectedDate.getDay() === 0 || selectedDate.getDay() === 6;

    const selectedTimeline = useMemo(() => {
        return TIME_COLUMNS.map((column) => ({
            column,
            slot:
                column.kind === 'slot'
                    ? getTimetableSlot(slots, selectedShortDay, column.start, column.end)
                    : null,
        }));
    }, [selectedShortDay, slots]);

    const selectedSessions = selectedTimeline.filter((item) => item.slot).length;

    return (
        <section className={cn('space-y-5', className)}>
            <header className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(20,21,26,0.98),rgba(13,15,19,0.98))] p-5 sm:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/15 bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-orange-200">
                            <CalendarDays className="h-3.5 w-3.5" /> Timetable Desk
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-white md:text-4xl">{title}</h1>
                            <p className="mt-2 max-w-3xl text-sm text-zinc-400 md:text-[15px]">{subtitle}</p>
                        </div>
                    </div>
                    {action ? <div className="flex flex-wrap items-center gap-3">{action}</div> : null}
                </div>
            </header>

            <div className="rounded-[28px] border border-white/[0.08] bg-zinc-900/50 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3 py-3 sm:px-4">
                    <button
                        type="button"
                        onClick={() => setSelectedDate((prev) => addDays(prev, -7))}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition hover:border-orange-400/30 hover:text-white"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div className="text-center">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Week Of</div>
                        <div className="mt-1 text-xl font-black text-white">
                            {selectedDate.toLocaleDateString('en-US', {
                                month: 'long',
                                year: 'numeric',
                            })}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSelectedDate((prev) => addDays(prev, 7))}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition hover:border-orange-400/30 hover:text-white"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-7 gap-2">
                    {weekDays.map((date) => {
                        const active = isSameDay(date, selectedDate);
                        const weekend = date.getDay() === 0 || date.getDay() === 6;
                        return (
                            <button
                                key={date.toISOString()}
                                type="button"
                                onClick={() => setSelectedDate(date)}
                                className={cn(
                                    'rounded-2xl border px-2 py-3 text-center transition',
                                    active
                                        ? 'border-orange-400/35 bg-orange-500/16 shadow-[0_0_0_1px_rgba(251,146,60,0.2)]'
                                        : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.03]',
                                )}
                            >
                                <div className={cn('text-[10px] font-bold uppercase tracking-[0.18em]', active ? 'text-orange-100' : 'text-zinc-500')}>
                                    {dayShortNames[date.getDay()]}
                                </div>
                                <div className={cn('mt-2 text-2xl font-black leading-none', active ? 'text-white' : weekend ? 'text-zinc-500' : 'text-zinc-100')}>
                                    {date.getDate()}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.08] bg-zinc-900/50 p-4 sm:p-6">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Selected Day</div>
                        <h2 className="mt-1 text-xl font-black text-white">
                            {selectedLongDay}, {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </h2>
                    </div>
                    <div className="text-sm text-zinc-400">
                        {isWeekend
                            ? 'Weekend is off for regular classes.'
                            : selectedSessions
                                ? `${selectedSessions} slot${selectedSessions === 1 ? '' : 's'} scheduled from 9 AM to 4 PM`
                                : 'No scheduled classes found for this day.'}
                    </div>
                </div>

                {isWeekend ? (
                    <div className="rounded-[24px] border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Weekend</div>
                        <div className="mt-3 text-2xl font-black text-white">Saturday & Sunday are off</div>
                        <div className="mt-2 text-sm text-zinc-500">Choose a weekday above to review scheduled lecture, tutorial, lab, and lunch blocks.</div>
                    </div>
                ) : slots.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center text-sm text-zinc-500">
                        {emptyMessage}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {selectedTimeline.map(({ column, slot }, idx) => {
                            const blockLabel = column.block;
                            if (column.kind === 'lunch') {
                                return (
                                    <motion.div
                                        key={`lunch-${column.start}`}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        className="grid gap-3 rounded-[24px] border border-amber-400/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(20,20,23,0.85))] p-4 md:grid-cols-[170px_minmax(0,1fr)] md:items-center"
                                    >
                                        <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-4 text-center">
                                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">{blockLabel} Block</div>
                                            <div className="mt-2 text-lg font-black text-white">{formatTimetableTime(column.start)}</div>
                                            <div className="text-sm text-zinc-400">to {formatTimetableTime(column.end)}</div>
                                        </div>
                                        <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5">
                                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/12 text-amber-200">
                                                <Coffee className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/80">Lunch Break</div>
                                                <div className="mt-1 text-lg font-black text-white">Midday reset block</div>
                                                <div className="mt-1 text-sm text-zinc-400">Reserved lunch window with no scheduled teaching slot.</div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            }

                            if (!slot) {
                                return (
                                    <motion.div
                                        key={`free-${column.start}`}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        className="grid gap-3 rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-4 md:grid-cols-[170px_minmax(0,1fr)] md:items-center"
                                    >
                                        <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-4 text-center">
                                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">{blockLabel} Block</div>
                                            <div className="mt-2 text-lg font-black text-white">{formatTimetableTime(column.start)}</div>
                                            <div className="text-sm text-zinc-500">to {formatTimetableTime(column.end)}</div>
                                        </div>
                                        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-5">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Free Period</div>
                                            <div className="mt-1 text-base font-semibold text-zinc-200">No class scheduled for this slot</div>
                                            <div className="mt-1 text-sm text-zinc-500">Use it for prep, office hours, or reading.</div>
                                        </div>
                                    </motion.div>
                                );
                            }

                            return (
                                <motion.div
                                    key={slot.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.03 }}
                                    className={cn(
                                        'grid gap-3 rounded-[24px] border p-4 md:grid-cols-[170px_minmax(0,1fr)] md:items-center',
                                        toneFor(slot.type),
                                    )}
                                >
                                    <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-center">
                                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{blockLabel} Block</div>
                                        <div className="mt-2 text-lg font-black text-white">{formatTimetableTime(slot.start)}</div>
                                        <div className="text-sm text-white/70">to {formatTimetableTime(slot.end)}</div>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', badgeToneFor(slot.type))}>
                                                {slot.type}
                                            </span>
                                            <span className="inline-flex rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                                                {slot.code}
                                            </span>
                                        </div>
                                        <div className="mt-3 text-lg font-black leading-snug text-white">{slot.course}</div>
                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/80">
                                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1.5">
                                                <MapPin className="h-4 w-4 shrink-0" />
                                                <span className="truncate">{slot.room}</span>
                                            </div>
                                            {slot.department ? (
                                                <div className="inline-flex rounded-full border border-white/10 bg-black/10 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-white/70">
                                                    {slot.department}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}
