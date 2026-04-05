/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, Coffee, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HoverTooltip } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    TIME_COLUMNS,
    formatTimetableTime,
    getAcademicHoliday,
    getTimetableSlot,
    type TimetableSlot,
    type TimetableSlotType,
} from '@/lib/timetable';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

const SURFACE_TONES: Record<TimetableSlotType, string> = {
    lecture: 'border-orange-300/35 bg-orange-400/10 text-orange-50',
    tutorial: 'border-sky-300/35 bg-sky-400/10 text-sky-50',
    lab: 'border-emerald-300/35 bg-emerald-400/10 text-emerald-50',
};

const BADGE_TONES: Record<TimetableSlotType, string> = {
    lecture: 'border-orange-300/25 bg-orange-400/15 text-orange-100',
    tutorial: 'border-sky-300/25 bg-sky-400/15 text-sky-100',
    lab: 'border-emerald-300/25 bg-emerald-400/15 text-emerald-100',
};

type DateTimetableAgendaProps = {
    slots: TimetableSlot[];
    title: string;
    subtitle: string;
    emptyMessage: string;
    action?: ReactNode;
    className?: string;
};

function addDays(date: Date, amount: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    next.setHours(0, 0, 0, 0);
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

function isSameMonth(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function getMonthStart(date: Date) {
    const next = new Date(date.getFullYear(), date.getMonth(), 1);
    next.setHours(0, 0, 0, 0);
    return next;
}

function getCalendarStart(date: Date) {
    return getWeekStart(getMonthStart(date));
}

function buildMonthGrid(date: Date) {
    const start = getCalendarStart(date);
    return Array.from({ length: 35 }, (_, idx) => addDays(start, idx));
}

function toneFor(type: TimetableSlotType) {
    return SURFACE_TONES[type] || 'border-white/[0.08] bg-white/[0.03] text-white';
}

function badgeToneFor(type: TimetableSlotType) {
    return BADGE_TONES[type] || 'border-white/[0.08] bg-white/[0.04] text-zinc-200';
}

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
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [calendarDate, setCalendarDate] = useState(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    });
    const [jumpMonthIndex, setJumpMonthIndex] = useState(() => {
        const today = new Date();
        return today.getMonth();
    });
    const [jumpYearValue, setJumpYearValue] = useState(() => {
        const today = new Date();
        return String(today.getFullYear());
    });
    const calendarRef = useRef<HTMLDivElement | null>(null);

    const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)),
        [weekStart],
    );
    const monthGrid = useMemo(() => buildMonthGrid(calendarDate), [calendarDate]);

    const selectedShortDay = DAY_SHORT[selectedDate.getDay()];
    const selectedLongDay = DAY_LONG[selectedDate.getDay()];
    const isWeekend = selectedDate.getDay() === 0 || selectedDate.getDay() === 6;
    const selectedHoliday = getAcademicHoliday(selectedDate);

    const selectedTimeline = useMemo(
        () =>
            TIME_COLUMNS.map((column) => ({
                column,
                slot:
                    column.kind === 'slot'
                        ? getTimetableSlot(slots, selectedShortDay, column.start, column.end)
                        : null,
            })),
        [selectedShortDay, slots],
    );

    const selectedSessions = selectedTimeline.filter((item) => item.slot).length;

    useEffect(() => {
        if (!isCalendarOpen) return;
        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (calendarRef.current?.contains(target as Node)) return;
            if (target?.closest('[data-radix-popper-content-wrapper]')) return;
            setIsCalendarOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isCalendarOpen]);

    return (
        <section className={cn('space-y-5', className)}>
            <header className="rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_24%),linear-gradient(145deg,rgba(18,19,24,0.98),rgba(11,12,16,0.98))] p-5 sm:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
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
                <div
                    ref={calendarRef}
                    className="relative flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3 py-3 sm:px-4"
                >
                    <button
                        type="button"
                        onClick={() => setSelectedDate((prev) => addDays(prev, -7))}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition hover:border-orange-400/30 hover:text-white"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setCalendarDate(selectedDate);
                            setJumpMonthIndex(selectedDate.getMonth());
                            setJumpYearValue(String(selectedDate.getFullYear()));
                            setIsCalendarOpen((prev) => !prev);
                        }}
                        className="rounded-2xl border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.12),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-4 py-2 text-center transition hover:border-fuchsia-400/25 hover:bg-fuchsia-500/8"
                    >
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Week Of</div>
                        <div className="mt-1 text-xl font-black text-white">
                            {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => setSelectedDate((prev) => addDays(prev, 7))}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition hover:border-orange-400/30 hover:text-white"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>

                    {isCalendarOpen ? (
                        <div className="absolute left-1/2 top-[calc(100%+12px)] z-20 w-[min(92vw,360px)] -translate-x-1/2 rounded-[24px] border border-fuchsia-400/15 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.16),transparent_35%),linear-gradient(180deg,rgba(18,19,24,0.98),rgba(11,12,16,0.98))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                            <div className="flex items-center justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCalendarDate((prev) => {
                                            const next = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
                                            setJumpMonthIndex(next.getMonth());
                                            setJumpYearValue(String(next.getFullYear()));
                                            return next;
                                        })
                                    }
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition hover:border-orange-400/30 hover:text-white"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <div className="text-center">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-fuchsia-200/75">Pick Date</div>
                                    <div className="mt-1 text-lg font-black text-white">
                                        {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCalendarDate((prev) => {
                                            const next = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
                                            setJumpMonthIndex(next.getMonth());
                                            setJumpYearValue(String(next.getFullYear()));
                                            return next;
                                        })
                                    }
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition hover:border-orange-400/30 hover:text-white"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="mt-4 rounded-2xl border border-fuchsia-400/15 bg-[linear-gradient(180deg,rgba(168,85,247,0.08),rgba(255,255,255,0.02))] p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                                        Jump To Month
                                    </label>
                                    <HoverTooltip content="Pick a month and year, then jump straight to that timetable week">
                                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-200/85">
                                            Month Picker
                                        </span>
                                    </HoverTooltip>
                                </div>
                                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]">
                                    <Select
                                        value={String(jumpMonthIndex)}
                                        onValueChange={(value) => {
                                            const monthIndex = Number(value);
                                            setJumpMonthIndex(monthIndex);
                                            setCalendarDate((prev) => new Date(Number(jumpYearValue) || prev.getFullYear(), monthIndex, 1));
                                        }}
                                    >
                                        <SelectTrigger className="h-11 rounded-xl border-fuchsia-400/18 bg-[linear-gradient(180deg,rgba(99,102,241,0.08),rgba(168,85,247,0.08))] text-left font-semibold text-white focus:border-fuchsia-400/35">
                                            <SelectValue>
                                                {MONTH_NAMES[jumpMonthIndex]}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent className="border-fuchsia-400/18 bg-[linear-gradient(180deg,rgba(18,19,24,0.98),rgba(24,18,36,0.98))]">
                                            {MONTH_NAMES.map((month, index) => (
                                                <SelectItem key={month} value={String(index)}>
                                                    {month}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <div className="flex h-11 items-center overflow-hidden rounded-xl border border-fuchsia-400/18 bg-[linear-gradient(180deg,rgba(99,102,241,0.08),rgba(168,85,247,0.08))]">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={jumpYearValue}
                                            onChange={(event) => setJumpYearValue(event.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                                            className="h-full flex-1 bg-transparent px-3 text-sm font-semibold text-white outline-none"
                                        />
                                        <div className="mr-1 flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setJumpYearValue((prev) => {
                                                        const nextYear = Math.min(2035, (Number(prev) || new Date().getFullYear()) + 1);
                                                        setCalendarDate((current) => new Date(nextYear, jumpMonthIndex, 1));
                                                        return String(nextYear);
                                                    })
                                                }
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:border-fuchsia-300/30 hover:text-white"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setJumpYearValue((prev) => {
                                                        const nextYear = Math.max(2024, (Number(prev) || new Date().getFullYear()) - 1);
                                                        setCalendarDate((current) => new Date(nextYear, jumpMonthIndex, 1));
                                                        return String(nextYear);
                                                    })
                                                }
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:border-fuchsia-300/30 hover:text-white"
                                            >
                                                <Minus className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const year = Number(jumpYearValue);
                                            if (!Number.isFinite(year)) return;
                                            const next = new Date(year, jumpMonthIndex, Math.min(selectedDate.getDate(), 28));
                                            setSelectedDate(next);
                                            setCalendarDate(new Date(year, jumpMonthIndex, 1));
                                            setIsCalendarOpen(false);
                                        }}
                                        className="inline-flex h-11 items-center justify-center rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/12 px-4 text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-100 transition hover:border-fuchsia-300/35 hover:bg-fuchsia-500/18"
                                    >
                                        Go
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-7 gap-2">
                                {DAY_SHORT.map((day) => (
                                    <div key={day} className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                                        {day}
                                    </div>
                                ))}
                                {monthGrid.map((date) => {
                                    const active = isSameDay(date, selectedDate);
                                    const muted = !isSameMonth(date, calendarDate);
                                    const weekend = date.getDay() === 0 || date.getDay() === 6;
                                    return (
                                        <button
                                            key={date.toISOString()}
                                            type="button"
                                            onClick={() => {
                                                setSelectedDate(date);
                                                setIsCalendarOpen(false);
                                            }}
                                            className={cn(
                                                'aspect-square rounded-xl border text-sm font-bold transition',
                                                active
                                                    ? 'border-fuchsia-400/35 bg-fuchsia-500/18 text-white'
                                                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]',
                                                muted ? 'text-zinc-600' : weekend ? 'text-zinc-400' : 'text-zinc-100',
                                            )}
                                        >
                                            {date.getDate()}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="mt-4 -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-7 md:overflow-visible md:px-0">
                    {weekDays.map((date) => {
                        const active = isSameDay(date, selectedDate);
                        const weekend = date.getDay() === 0 || date.getDay() === 6;
                        return (
                            <button
                                key={date.toISOString()}
                                type="button"
                                onClick={() => setSelectedDate(date)}
                                className={cn(
                                    'min-w-[74px] snap-start rounded-2xl border px-2 py-3 text-center transition md:min-w-0',
                                    active
                                        ? 'border-orange-400/35 bg-orange-500/16 shadow-[0_0_0_1px_rgba(251,146,60,0.2)]'
                                        : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.03]',
                                )}
                            >
                                <div className={cn('text-[10px] font-bold uppercase tracking-[0.18em]', active ? 'text-orange-100' : 'text-zinc-500')}>
                                    {DAY_SHORT[date.getDay()]}
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
                        {selectedHoliday
                            ? `${selectedHoliday.name} is observed today across the timetable board.`
                            : isWeekend
                                ? 'Off-day window for rest, prep, and catch-up work.'
                            : selectedSessions
                                ? `${selectedSessions} block${selectedSessions === 1 ? '' : 's'} scheduled between 9 AM and 2 PM`
                                : 'No classes lined up today. Good window for prep, meetings, or revision.'}
                    </div>
                </div>

                {selectedHoliday ? (
                    <div className="rounded-[24px] border border-dashed border-emerald-400/15 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))] p-8">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300/80">Holiday Marker</div>
                        <div className="mt-3 text-2xl font-black text-white">{selectedHoliday.name}</div>
                        <div className="mt-2 max-w-2xl text-sm text-zinc-400">
                            This day is marked as a named academic holiday, so regular class blocks stay cleared. Use the week strip above to review the nearest active teaching day or download the official timetable PDF below.
                        </div>
                    </div>
                ) : isWeekend ? (
                    <div className="rounded-[24px] border border-dashed border-white/[0.08] bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.08),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))] p-8">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Weekend Outlook</div>
                        <div className="mt-3 text-2xl font-black text-white">No academic blocks scheduled today</div>
                        <div className="mt-2 max-w-2xl text-sm text-zinc-400">
                            Saturday and Sunday stay off the working sheet. Use the week strip above to jump into a weekday agenda or download the official timetable PDF below.
                        </div>
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
                                        className="grid gap-3 rounded-[24px] border border-amber-400/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(20,20,23,0.85))] p-4 md:grid-cols-[150px_minmax(0,1fr)] md:items-center"
                                    >
                                        <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-4 text-center">
                                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">Lunch</div>
                                            <div className="mt-2 text-lg font-black text-white">{formatTimetableTime(column.start)}</div>
                                            <div className="text-sm text-zinc-400">to {formatTimetableTime(column.end)}</div>
                                        </div>
                                        <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5">
                                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/12 text-amber-200">
                                                <Coffee className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/80">Midday Break</div>
                                                <div className="mt-1 text-lg font-black text-white">Reserved lunch interval</div>
                                                <div className="mt-1 text-sm text-zinc-400">Buffer between academic blocks, office hours, and daily reset.</div>
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
                                        className="grid gap-3 rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-4 md:grid-cols-[150px_minmax(0,1fr)] md:items-center"
                                    >
                                        <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-4 text-center">
                                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Block {blockLabel}</div>
                                            <div className="mt-2 text-lg font-black text-white">{formatTimetableTime(column.start)}</div>
                                            <div className="text-sm text-zinc-500">to {formatTimetableTime(column.end)}</div>
                                        </div>
                                        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-5">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Open Block</div>
                                            <div className="mt-1 text-base font-semibold text-zinc-200">No class scheduled in this slot</div>
                                            <div className="mt-1 text-sm text-zinc-500">Available for prep, review, mentoring, or class transitions.</div>
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
                                        'grid gap-3 rounded-[24px] border p-4 md:grid-cols-[150px_minmax(0,1fr)] md:items-center',
                                        toneFor(slot.type),
                                    )}
                                >
                                    <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-center">
                                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">Block {blockLabel}</div>
                                        <div className="mt-2 text-lg font-black text-white">{formatTimetableTime(slot.start)}</div>
                                        <div className="text-sm text-white/70">to {formatTimetableTime(slot.end)}</div>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', badgeToneFor(slot.type))}>
                                                    {slot.type}
                                                </span>
                                                <span className="inline-flex rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                                                    {slot.code}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-end gap-2 text-right">
                                                <div className="inline-flex rounded-full border border-white/10 bg-black/10 px-3 py-1.5 text-xs font-semibold text-white/80">
                                                    {slot.room}
                                                </div>
                                                {slot.department ? (
                                                    <div className="inline-flex rounded-full border border-white/10 bg-black/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/70">
                                                        {slot.department}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="mt-3 text-lg font-black leading-snug text-white">{slot.course}</div>
                                        {slot.facultyName ? (
                                            slot.facultyId ? (
                                                <Link
                                                    to={`/dashboard/faculty/${slot.facultyId}`}
                                                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-orange-100 transition hover:text-white hover:underline"
                                                >
                                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-bold uppercase text-white/85">
                                                        {slot.facultyName.slice(0, 1)}
                                                    </span>
                                                    {slot.facultyName}
                                                </Link>
                                            ) : (
                                                <div className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-orange-100">
                                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-bold uppercase text-white/85">
                                                        {slot.facultyName.slice(0, 1)}
                                                    </span>
                                                    {slot.facultyName}
                                                </div>
                                            )
                                        ) : null}
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
