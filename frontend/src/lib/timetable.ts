/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import type { CourseDirectoryItem } from '@/lib/api';

export type TimetableSlotType = 'lecture' | 'tutorial' | 'lab';

export type TimetableSlot = {
    id: string;
    day: string;
    start: string;
    end: string;
    course: string;
    code: string;
    room: string;
    type: TimetableSlotType;
    department?: string | null;
    facultyId?: string | null;
    facultyName?: string | null;
};

export const WORK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export const OFF_DAYS = ['Sat', 'Sun'] as const;

export const ACADEMIC_HOLIDAYS = [
    { month: 1, day: 26, name: 'Republic Day' },
    { month: 8, day: 15, name: 'Independence Day' },
    { month: 10, day: 2, name: 'Gandhi Jayanti' },
] as const;

export const TIME_COLUMNS = [
    { start: '09:00', end: '10:00', label: '9 AM', block: 'A', kind: 'slot' as const },
    { start: '10:00', end: '11:00', label: '10 AM', block: 'B', kind: 'slot' as const },
    { start: '11:00', end: '12:00', label: '11 AM', block: 'C', kind: 'slot' as const },
    { start: '12:00', end: '13:00', label: 'Lunch', block: 'L', kind: 'lunch' as const },
    { start: '13:00', end: '14:00', label: '1 PM', block: 'D', kind: 'slot' as const },
] as const;

type ScheduleBlueprint = {
    day: (typeof WORK_DAYS)[number];
    start: string;
    end: string;
    type: TimetableSlotType;
};

const SLOT_BLUEPRINTS: ScheduleBlueprint[] = [
    { day: 'Mon', start: '09:00', end: '10:00', type: 'lecture' },
    { day: 'Mon', start: '10:00', end: '11:00', type: 'tutorial' },
    { day: 'Tue', start: '11:00', end: '12:00', type: 'lecture' },
    { day: 'Wed', start: '13:00', end: '14:00', type: 'lab' },
    { day: 'Thu', start: '09:00', end: '10:00', type: 'lecture' },
    { day: 'Fri', start: '10:00', end: '11:00', type: 'lecture' },
    { day: 'Tue', start: '09:00', end: '10:00', type: 'tutorial' },
    { day: 'Thu', start: '11:00', end: '12:00', type: 'lab' },
] as const;

function normalize(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function cleanDisplayText(value?: string | null) {
    return String(value || '')
        .replace(/[_]+/g, ' ')
        .replace(/[-]{2,}/g, ' ')
        .replace(/\s*\/\s*/g, ' / ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function hashString(value: string) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) % 100000;
    }
    return Math.abs(hash);
}

function buildRoom(course: CourseDirectoryItem, block: string) {
    const hash = hashString(`${course.code}-${course.title}`);
    const room = 200 + ((hash % 8) + 1);
    return `${block}-${room}`;
}

function compactCourseTitle(course: CourseDirectoryItem) {
    const cleanTitle = cleanDisplayText(course.title || course.code || 'Course');
    const code = cleanDisplayText(course.code).toUpperCase();
    if (!code) return cleanTitle;
    const titleWithoutCode = cleanTitle.replace(new RegExp(`^${code}\\s*`, 'i'), '').trim();
    return titleWithoutCode || cleanTitle || code;
}

function inferType(course: CourseDirectoryItem, fallbackType: TimetableSlotType): TimetableSlotType {
    const haystack = `${course.code} ${course.title}`.toLowerCase();
    if (haystack.includes('lab')) return 'lab';
    if (haystack.includes('tutorial')) return 'tutorial';
    return fallbackType;
}

export function buildLiveTimetableSlots(
    courses: CourseDirectoryItem[],
    options?: {
        userId?: string | null;
        role?: string | null;
        department?: string | null;
        program?: string | null;
        currentUserName?: string | null;
        facultyLookup?: Record<string, { id: string; full_name: string }>;
    },
) {
    const userId = String(options?.userId || '').trim();
    const role = normalize(options?.role);
    const department = normalize(options?.department);
    const program = normalize(options?.program);
    const currentUserName = String(options?.currentUserName || '').trim();
    const facultyLookup = options?.facultyLookup || {};

    const scopedCourses = [...courses]
        .filter((course) => {
            if (role !== 'faculty') return true;
            if (userId && (course.faculty_ids || []).includes(userId)) return true;
            const deptMatch = department && normalize(course.department).includes(department);
            const programMatch = program && `${normalize(course.code)} ${normalize(course.title)}`.includes(program);
            return Boolean(deptMatch || programMatch);
        })
        .sort((a, b) => a.code.localeCompare(b.code))
        .slice(0, SLOT_BLUEPRINTS.length);

    return scopedCourses.map((course, index): TimetableSlot => {
        const blueprint = SLOT_BLUEPRINTS[index % SLOT_BLUEPRINTS.length];
        const type = inferType(course, blueprint.type);
        const block = TIME_COLUMNS.find(
            (column) =>
                column.kind === 'slot' &&
                column.start === blueprint.start &&
                column.end === blueprint.end,
        )?.block || 'A';
        const matchedFacultyId =
            (course.faculty_ids || []).find((facultyId) => facultyLookup[facultyId]) ||
            (course.faculty_ids || [])[0] ||
            null;
        const matchedFacultyName =
            role === 'faculty'
                ? currentUserName || facultyLookup[matchedFacultyId || '']?.full_name || 'Assigned Faculty'
                : matchedFacultyId
                    ? facultyLookup[matchedFacultyId]?.full_name || 'Assigned Faculty'
                    : null;
        return {
            id: `${course.id}-${blueprint.day}-${blueprint.start}`,
            day: blueprint.day,
            start: blueprint.start,
            end: blueprint.end,
            type,
            course: compactCourseTitle(course),
            code: cleanDisplayText(course.code || 'COURSE').toUpperCase(),
            room: buildRoom(course, block),
            department: cleanDisplayText(course.department),
            facultyId: matchedFacultyId,
            facultyName: matchedFacultyName,
        };
    });
}

export function summarizeTimetable(slots: TimetableSlot[]) {
    const labs = slots.filter((slot) => slot.type === 'lab').length;
    const lectures = slots.filter((slot) => slot.type === 'lecture').length;
    const tutorials = slots.filter((slot) => slot.type === 'tutorial').length;
    const rooms = new Set(slots.map((slot) => slot.room)).size;
    return {
        blocks: slots.length,
        lectures,
        tutorials,
        labs,
        rooms,
    };
}

export function groupTimetableByDay(slots: TimetableSlot[]) {
    return WORK_DAYS.map((day) => ({
        day,
        slots: slots.filter((slot) => slot.day === day),
    }));
}

export function getTimetableSlot(
    slots: TimetableSlot[],
    day: string,
    start: string,
    end: string,
) {
    return slots.find((slot) => slot.day === day && slot.start === start && slot.end === end) || null;
}

export function getTimetableBlockLabel(start: string, end: string) {
    return (
        TIME_COLUMNS.find(
            (column) =>
                column.kind === 'slot' &&
                column.start === start &&
                column.end === end,
        )?.block || 'A'
    );
}

export function getTodayWorkdayLabel(date = new Date()) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function formatTimetableTime(value: string) {
    const [hours, minutes] = value.split(':').map(Number);
    const normalizedHours = Number.isFinite(hours) ? hours : 0;
    const normalizedMinutes = Number.isFinite(minutes) ? minutes : 0;
    const suffix = normalizedHours >= 12 ? 'PM' : 'AM';
    const twelveHour = normalizedHours % 12 || 12;
    return `${twelveHour}:${String(normalizedMinutes).padStart(2, '0')} ${suffix}`;
}

export function getAcademicHoliday(date: Date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return ACADEMIC_HOLIDAYS.find((holiday) => holiday.month === month && holiday.day === day) || null;
}
