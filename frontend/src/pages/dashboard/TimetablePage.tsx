/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useAuthStore } from '@/store/authStore';
import FacultyTimetablePage from '@/pages/dashboard/FacultyTimetablePage';
import StudentTimetablePage from '@/pages/dashboard/StudentTimetablePage';

export default function TimetablePage() {
    const { user } = useAuthStore();
    return user?.role === 'faculty' ? <FacultyTimetablePage /> : <StudentTimetablePage />;
}
