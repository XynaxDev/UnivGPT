/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, RefreshCw, Send, Clock3, Users, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MultiSelect, Select } from '@/components/ui/auth-fuse';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { documentsApi, noticesApi, type DocumentPreviewResponse, type DocumentResponse, type ServedNoticeItem } from '@/lib/api';
import { DocumentPreviewModal } from '@/components/ui/DocumentPreviewModal';
import { NoticePreviewModal } from '@/components/ui/NoticePreviewModal';
import { useLocation, useNavigate } from 'react-router-dom';

const formatDate = (value?: string | null) => {
    if (!value) return 'Unknown time';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Unknown time';
    return dt.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const isUuidLike = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const isNoticeLikeDocument = (doc: DocumentResponse) =>
    String((doc.metadata || {}).notice_type || '').trim().toLowerCase() === 'served';

export default function NoticesPage() {
    const { token, user } = useAuthStore();
    const { showToast } = useToastStore();
    const location = useLocation();
    const navigate = useNavigate();
    const role = String(user?.role || 'student').toLowerCase();
    const canServe = role === 'admin' || role === 'faculty';

    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [targetSelection, setTargetSelection] = useState<string[]>(['students']);
    const [department, setDepartment] = useState(user?.department || '');
    const [course, setCourse] = useState('');
    const [tagsInput, setTagsInput] = useState('');
    const [attachmentDocumentId, setAttachmentDocumentId] = useState('__none__');
    const [isSending, setIsSending] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [items, setItems] = useState<ServedNoticeItem[]>([]);
    const [attachmentOptions, setAttachmentOptions] = useState<DocumentResponse[]>([]);
    const [previewDoc, setPreviewDoc] = useState<DocumentPreviewResponse | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isAttachmentLoading, setIsAttachmentLoading] = useState(false);
    const [previewPendingTitle, setPreviewPendingTitle] = useState('');
    const [previewPendingSubtitle, setPreviewPendingSubtitle] = useState('');
    const [previewMode, setPreviewMode] = useState<'notice' | 'document'>('document');
    const [noticesPage, setNoticesPage] = useState(1);
    const [focusedNoticeId, setFocusedNoticeId] = useState<string | null>(null);
    const [pendingOpenNoticeId, setPendingOpenNoticeId] = useState<string | null>(null);
    const NOTICES_PER_PAGE = 5;

    const targetOptions = useMemo(
        () =>
            role === 'admin'
                ? [
                    { value: 'students', label: 'Students' },
                    { value: 'faculty', label: 'Faculty' },
                ]
                : [{ value: 'students', label: 'Students' }],
        [role],
    );

    useEffect(() => {
        if (role !== 'admin') {
            setTargetSelection(['students']);
            return;
        }
        setTargetSelection((prev) => {
            if (prev.includes('both')) return ['students', 'faculty'];
            const next = prev.filter((value) => targetOptions.some((option) => option.value === value));
            return next.length ? next : ['students'];
        });
    }, [role, targetOptions]);

    const target = useMemo<'students' | 'faculty' | 'both'>(() => {
        const hasStudents = targetSelection.includes('students');
        const hasFaculty = targetSelection.includes('faculty');
        if (hasStudents && hasFaculty) return 'both';
        if (hasFaculty) return 'faculty';
        return 'students';
    }, [targetSelection]);

    const loadNotices = useCallback(
        async (force = false, silent = false) => {
            if (!token || !canServe) {
                setItems([]);
                return;
            }
            if (!silent) setIsLoading(true);
            try {
                const res = await noticesApi.listServed(token, 180, { force });
                const sorted = [...(res.items || [])].sort((a, b) => {
                    const aa = new Date(a.uploaded_at || 0).getTime();
                    const bb = new Date(b.uploaded_at || 0).getTime();
                    return bb - aa;
                });
                setItems(sorted);
            } catch (err: any) {
                if (force) showToast(err?.message || 'Failed to load notices.', 'error');
                if (!silent) setItems([]);
            } finally {
                if (!silent) setIsLoading(false);
            }
        },
        [token, canServe, showToast],
    );

    useEffect(() => {
        if (!token || !canServe) return;
        const cachedNotices = noticesApi.peekListServed(token, 180);
        if (cachedNotices?.items) {
            const sorted = [...(cachedNotices.items || [])].sort((a, b) => {
                const aa = new Date(a.uploaded_at || 0).getTime();
                const bb = new Date(b.uploaded_at || 0).getTime();
                return bb - aa;
            });
            setItems(sorted);
            setIsLoading(false);
            return;
        }
        loadNotices();
    }, [loadNotices, token, canServe]);

    useEffect(() => {
        let active = true;
        const loadAttachmentOptions = async () => {
            if (!token || !canServe) return;
            const cachedDocs = documentsApi.peekList(token, { page: 1, per_page: 60 });
            if (active && cachedDocs?.documents?.length) {
                setAttachmentOptions(
                    (cachedDocs.documents || [])
                        .filter((doc) => !isNoticeLikeDocument(doc))
                        .slice(0, 60),
                );
                return;
            }
            try {
                const response = await documentsApi.list(token, { page: 1, per_page: 60 });
                if (!active) return;
                setAttachmentOptions(
                    (response.documents || [])
                        .filter((doc) => !isNoticeLikeDocument(doc))
                        .slice(0, 60),
                );
            } catch {
                if (!active) return;
                setAttachmentOptions([]);
            }
        };
        loadAttachmentOptions();
        return () => {
            active = false;
        };
    }, [token, canServe]);

    useEffect(() => {
        setNoticesPage(1);
    }, [items.length]);

    useEffect(() => {
        const state = location.state as { focusNoticeDocumentId?: string; openNoticeDocumentId?: string } | null;
        const nextId = state?.focusNoticeDocumentId || null;
        const nextOpenId = state?.openNoticeDocumentId || null;
        if (!nextId) return;
        setFocusedNoticeId(nextId);
        setPendingOpenNoticeId(nextOpenId);
        const itemIndex = items.findIndex((item) => item.id === nextId);
        if (itemIndex >= 0) {
            setNoticesPage(Math.floor(itemIndex / NOTICES_PER_PAGE) + 1);
        }
        const timer = window.setTimeout(() => {
            setFocusedNoticeId(null);
            navigate(location.pathname, { replace: true, state: {} });
        }, 2800);
        return () => window.clearTimeout(timer);
    }, [location.pathname, location.state, navigate, items]);

    useEffect(() => {
        if (!focusedNoticeId) return;
        const el = document.querySelector(`[data-notice-id="${focusedNoticeId}"]`);
        if (el instanceof HTMLElement) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [focusedNoticeId, noticesPage, items]);

    const previewDocument = useCallback(async (
        documentId: string,
        pending?: { title?: string; subtitle?: string },
        mode: 'notice' | 'document' = 'document',
    ) => {
        if (!token || isPreviewLoading || !isUuidLike(documentId)) {
            if (documentId && !isUuidLike(documentId)) {
                showToast('This notice is not linked to a previewable document.', 'error');
            }
            return;
        }
        setPreviewMode(mode);
        setPreviewPendingTitle(pending?.title || 'Loading notice...');
        setPreviewPendingSubtitle(pending?.subtitle || 'Preparing preview...');
        setPreviewDoc(null);
        setIsPreviewOpen(true);
        setIsPreviewLoading(true);
        try {
            const res = await documentsApi.preview(token, documentId);
            setPreviewDoc(res);
        } catch (err: any) {
            setIsPreviewOpen(false);
            showToast(err?.message || 'Preview is not available for this notice yet.', 'error');
        } finally {
            setIsPreviewLoading(false);
        }
    }, [token, isPreviewLoading, showToast]);

    useEffect(() => {
        if (!pendingOpenNoticeId || !items.length) return;
        const match = items.find((item) => item.id === pendingOpenNoticeId);
        if (!match) return;
        setPendingOpenNoticeId(null);
        void previewDocument(
            match.id,
            {
                title: match.title,
                subtitle: `${match.course || 'General'} · ${match.department || 'No department'} · ${match.doc_type}`,
            },
            'notice',
        );
    }, [pendingOpenNoticeId, items, previewDocument]);

    const handleServeNotice = async () => {
        if (!token || !canServe || isSending) return;
        if (title.trim().length < 3) {
            showToast('Please enter a notice title.', 'error');
            return;
        }
        if (message.trim().length < 8) {
            showToast('Please enter a meaningful notice message.', 'error');
            return;
        }
        if (!targetSelection.length) {
            showToast('Select at least one target audience.', 'error');
            return;
        }

        const tags = tagsInput
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);

        setIsSending(true);
        try {
            const res = await noticesApi.serve(token, {
                title: title.trim(),
                message: message.trim(),
                target,
                department: department.trim(),
            course: course.trim(),
            tags,
            attachment_document_id: attachmentDocumentId === '__none__' ? null : attachmentDocumentId,
        });
            showToast(res.message || 'Notice sent successfully.', 'success');
            setTitle('');
            setMessage('');
            setCourse('');
            setTagsInput('');
            setAttachmentDocumentId('__none__');
            const optimisticItems = (res.created || []).map((created) => ({
                id: created.id,
                title: created.title || title.trim(),
                message: message.trim(),
                doc_type: created.doc_type,
                department: created.department || department.trim() || null,
                course: created.course || course.trim() || null,
                uploaded_at: new Date().toISOString(),
                attachment_document_id: attachmentDocumentId === '__none__' ? null : attachmentDocumentId,
                attachment_filename:
                    attachmentDocumentId === '__none__'
                        ? null
                        : attachmentOptions.find((doc) => doc.id === attachmentDocumentId)?.filename || null,
            }));
            if (optimisticItems.length) {
                setItems((prev) => {
                    const seen = new Set(prev.map((item) => item.id));
                    return [...optimisticItems.filter((item) => !seen.has(item.id)), ...prev];
                });
            }
            await loadNotices(true);
        } catch (err: any) {
            showToast(err?.message || 'Failed to send notice.', 'error');
        } finally {
            setIsSending(false);
        }
    };

    if (!canServe) {
        return (
            <div className="h-full overflow-y-auto p-6 sm:p-8 md:p-10 w-full">
                <div className="max-w-6xl mx-auto rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-400">
                    Notices can be served by admin or faculty accounts only.
                </div>
            </div>
        );
    }

    const totalNoticePages = Math.max(1, Math.ceil(items.length / NOTICES_PER_PAGE));
    const paginatedItems = useMemo(() => {
        const start = (noticesPage - 1) * NOTICES_PER_PAGE;
        return items.slice(start, start + NOTICES_PER_PAGE);
    }, [items, noticesPage]);

    return (
        <div className="h-full overflow-y-auto p-6 sm:p-8 md:p-10 w-full">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto w-full space-y-6">
                <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-r from-[#201108] via-[#161117] to-[#0b1226] p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <div className="inline-flex items-center rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-[10px] tracking-[0.18em] uppercase font-bold text-orange-300 mb-2">
                                Notice Delivery
                            </div>
                            <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-white flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 shrink-0 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                                    <Megaphone className="w-4 h-4 text-orange-400" />
                                </div>
                                <span className="min-w-0">Notice Serving Console</span>
                            </h1>
                            <p className="text-sm text-zinc-300 max-w-2xl">
                                Send structured notices to role-targeted audiences. Admin can send to students/faculty; faculty can send to students.
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => loadNotices(true)}
                            className="rounded-xl h-9 px-4 text-xs border-white/15 text-zinc-300 hover:text-white"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-zinc-900/30 p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="text-xs text-zinc-400 block">
                            Notice Title
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Exam Schedule Update"
                                className="mt-1 w-full h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/30"
                            />
                        </label>
                        <label className="text-xs text-zinc-400 block">
                            Target
                            <MultiSelect
                                id="notice-target"
                                value={targetSelection}
                                onValueChange={setTargetSelection}
                                placeholder="Select target audiences"
                                className="mt-1 h-10 rounded-xl bg-black/40"
                                options={targetOptions}
                            />
                        </label>
                    </div>

                    <label className="text-xs text-zinc-400 block">
                        Notice Message
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={4}
                            placeholder="Write the notice message students/faculty should receive..."
                            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-500/30 resize-none"
                        />
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <label className="text-xs text-zinc-400 block">
                            Department (optional)
                            <input
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                placeholder="Computer Science"
                                className="mt-1 w-full h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/30"
                            />
                        </label>
                        <label className="text-xs text-zinc-400 block">
                            Course (optional)
                            <input
                                value={course}
                                onChange={(e) => setCourse(e.target.value)}
                                placeholder="CS301"
                                className="mt-1 w-full h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/30"
                            />
                        </label>
                        <label className="text-xs text-zinc-400 block">
                            Tags (optional)
                            <input
                                value={tagsInput}
                                onChange={(e) => setTagsInput(e.target.value)}
                                placeholder="exam,deadline,notice"
                                className="mt-1 w-full h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/30"
                            />
                        </label>
                        <label className="text-xs text-zinc-400 block md:col-span-3">
                            Attachment (optional)
                            <Select
                                id="notice-attachment"
                                value={attachmentDocumentId}
                                onValueChange={setAttachmentDocumentId}
                                className="mt-1 h-10 rounded-xl bg-black/40"
                                options={[
                                    { value: '__none__', label: 'No attachment' },
                                    ...attachmentOptions.map((doc) => ({
                                        value: doc.id,
                                        label: `${doc.filename} (${doc.doc_type})`,
                                    })),
                                ]}
                            />
                        </label>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            type="button"
                            onClick={handleServeNotice}
                            disabled={isSending}
                            className="rounded-xl h-10 px-5 w-auto bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-semibold transition-all shadow-md shadow-orange-500/20"
                        >
                            <Send className={`w-3.5 h-3.5 mr-1.5 ${isSending ? 'animate-pulse' : ''}`} />
                            {isSending ? 'Sending Notice...' : 'Serve Notice'}
                        </Button>
                    </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-zinc-900/30 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <Users className="w-4 h-4 text-orange-300" /> Served Notices
                        </h2>
                        <div className="text-xs text-zinc-500">{items.length} total</div>
                    </div>

                    {isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 4 }).map((_, idx) => (
                                <div key={`notice-skeleton-${idx}`} className="rounded-xl border border-white/[0.06] bg-black/40 p-3">
                                    <Skeleton className="h-4 w-64 mb-2" />
                                    <Skeleton className="h-3 w-full mb-1.5" />
                                    <Skeleton className="h-3 w-2/3" />
                                </div>
                            ))}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-xs text-zinc-500">No notices served yet.</div>
                    ) : (
                        <div className="space-y-2">
                            {paginatedItems.map((item) => (
                                <div
                                    key={item.id}
                                    data-notice-id={item.id}
                                    className={`rounded-xl border p-3 transition-colors ${
                                        focusedNoticeId === item.id
                                            ? 'border-orange-400/50 bg-orange-500/10 shadow-[0_0_0_1px_rgba(251,146,60,0.15)]'
                                            : 'border-white/[0.06] bg-black/40'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-xs font-semibold text-white truncate">{item.title}</div>
                                            <div className="text-[11px] text-zinc-400 mt-1 break-words">{item.message}</div>
                                            <div className="text-[10px] text-zinc-500 mt-2">
                                                {item.doc_type} - {item.department || 'No department'} - {item.course || 'General'}
                                            </div>
                                            {item.attachment_filename && (
                                                <div className="text-[10px] text-cyan-300 mt-1.5">
                                                    Attachment: {item.attachment_filename}
                                                </div>
                                            )}
                                        </div>
                                        <div className="shrink-0 flex flex-col items-end gap-2">
                                            <div className="text-[10px] text-zinc-500 inline-flex items-center gap-1">
                                                <Clock3 className="w-3 h-3" /> {formatDate(item.uploaded_at)}
                                            </div>
                                            <div className="flex flex-wrap justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        previewDocument(item.id, {
                                                            title: item.title,
                                                            subtitle: `${item.course || 'General'} · ${item.department || 'No department'} · ${item.doc_type}`,
                                                        }, 'notice')
                                                    }
                                                    className="h-8 px-3 rounded-lg border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.07] text-[11px] font-semibold text-orange-300 hover:text-orange-200 transition-colors inline-flex items-center gap-1.5"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    Open Notice
                                                </button>
                                                {item.attachment_document_id && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            previewDocument(item.attachment_document_id as string, {
                                                                title: item.attachment_filename || 'Attachment',
                                                                subtitle: `${item.course || 'General'} · ${item.department || 'No department'} · attachment`,
                                                            }, 'document')
                                                        }
                                                        className="h-8 px-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/15 text-[11px] font-semibold text-cyan-200 transition-colors"
                                                    >
                                                        View Attachment
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {totalNoticePages > 1 && (
                                <div className="flex items-center justify-between gap-3 pt-2">
                                    <div className="text-[11px] text-zinc-500">
                                        Showing {(noticesPage - 1) * NOTICES_PER_PAGE + 1}-{Math.min(noticesPage * NOTICES_PER_PAGE, items.length)} of {items.length} notices
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setNoticesPage((prev) => Math.max(1, prev - 1))}
                                            disabled={noticesPage === 1}
                                            className="h-8 px-3 text-xs"
                                        >
                                            Prev
                                        </Button>
                                        <div className="min-w-12 text-center text-[11px] text-zinc-400">
                                            {noticesPage} / {totalNoticePages}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setNoticesPage((prev) => Math.min(totalNoticePages, prev + 1))}
                                            disabled={noticesPage === totalNoticePages}
                                            className="h-8 px-3 text-xs"
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <NoticePreviewModal
                    isOpen={isPreviewOpen && previewMode === 'notice'}
                    previewDoc={previewDoc}
                    isLoading={isPreviewLoading && previewMode === 'notice'}
                    pendingTitle={previewPendingTitle}
                    pendingSubtitle={previewPendingSubtitle}
                    onClose={() => {
                        setIsPreviewOpen(false);
                        setPreviewDoc(null);
                        setPreviewPendingTitle('');
                        setPreviewPendingSubtitle('');
                        setPreviewMode('document');
                    }}
                    isAttachmentLoading={isAttachmentLoading}
                    onOpenAttachment={
                        previewDoc?.attachment_document_id
                            ? async () => {
                                if (!previewDoc.attachment_document_id || !isUuidLike(previewDoc.attachment_document_id) || !token) return;
                                setIsAttachmentLoading(true);
                                try {
                                    setPreviewMode('document');
                                    const attached = await documentsApi.preview(token, previewDoc.attachment_document_id);
                                    setPreviewDoc(attached);
                                } catch (err: any) {
                                    showToast(err?.message || 'Attachment preview is not available.', 'error');
                                } finally {
                                    setIsAttachmentLoading(false);
                                }
                            }
                            : undefined
                    }
                />
                <DocumentPreviewModal
                    isOpen={isPreviewOpen && previewMode === 'document'}
                    token={token}
                    previewDoc={previewDoc}
                    isLoading={isPreviewLoading && previewMode === 'document'}
                    pendingTitle={previewPendingTitle}
                    pendingSubtitle={previewPendingSubtitle}
                    onClose={() => {
                        setIsPreviewOpen(false);
                        setPreviewDoc(null);
                        setPreviewPendingTitle('');
                        setPreviewPendingSubtitle('');
                        setPreviewMode('document');
                    }}
                    onOpenAttachment={undefined}
                />
            </motion.div>
        </div>
    );
}


