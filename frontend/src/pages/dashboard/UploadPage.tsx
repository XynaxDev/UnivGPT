/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, X, Check, AlertCircle, CloudUpload, Loader2, Pencil, Trash2, RefreshCw, Layers, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/auth-fuse';
import { Skeleton } from '@/components/ui/skeleton';
import { HoverTooltip } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { documentsApi, type DocumentResponse } from '@/lib/api';

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';
type UploadMode = 'single' | 'batch';

interface PendingFile {
    file: File;
    name: string;
    size: string;
    status: UploadStatus;
}

const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md'];
const ACCEPTED_ATTR = '.pdf,.docx,.txt,.md';

const UploadPage = () => {
    const { token, user } = useAuthStore();
    const { showToast } = useToastStore();

    const [mode, setMode] = useState<UploadMode>('single');
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState<PendingFile[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'indexing' | 'completed'>('idle');
    const [uploadLabel, setUploadLabel] = useState('');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

    const [docType, setDocType] = useState('faculty');
    const [department, setDepartment] = useState(user?.department || '');
    const [course, setCourse] = useState('');
    const [tagsInput, setTagsInput] = useState('');

    const [documents, setDocuments] = useState<DocumentResponse[]>([]);
    const [isLoadingDocs, setIsLoadingDocs] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<Partial<DocumentResponse>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [docsPage, setDocsPage] = useState(1);
    const DOCS_PER_PAGE = 8;
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const uploadTimerRef = useRef<number | null>(null);
    const uploadStartRef = useRef<number | null>(null);
    const estimatedTotalRef = useRef<number>(0);

    const role = user?.role || 'student';
    const canUpload = role === 'admin' || role === 'faculty';
    const canAdminCrud = role === 'admin';
    const queueStats = useMemo(() => {
        const total = files.length;
        const pending = files.filter((f) => f.status === 'pending').length;
        const done = files.filter((f) => f.status === 'done').length;
        const failed = files.filter((f) => f.status === 'error').length;
        return { total, pending, done, failed };
    }, [files]);

    const docTypeOptions = useMemo(() => {
        if (role === 'admin') return ['public', 'student', 'faculty', 'admin'];
        if (role === 'faculty') return ['public', 'student', 'faculty'];
        return ['public'];
    }, [role]);

    useEffect(() => {
        if (!docTypeOptions.includes(docType)) {
            setDocType(docTypeOptions[0]);
        }
    }, [docType, docTypeOptions]);

    useEffect(() => {
        setDepartment(user?.department || '');
    }, [user?.department]);

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDuration = (seconds: number) => {
        const safe = Math.max(0, Math.floor(seconds));
        const mins = Math.floor(safe / 60)
            .toString()
            .padStart(2, '0');
        const secs = (safe % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const stopUploadTimer = useCallback(() => {
        if (uploadTimerRef.current) {
            window.clearInterval(uploadTimerRef.current);
            uploadTimerRef.current = null;
        }
    }, []);

    useEffect(() => () => stopUploadTimer(), [stopUploadTimer]);

    const getExtension = (name: string) => name.split('.').pop()?.toLowerCase() || '';

    const appendFiles = (incoming: File[]) => {
        const valid: PendingFile[] = [];
        const rejected: string[] = [];
        const alreadyUploaded: string[] = [];
        const alreadyQueued: string[] = [];
        const uploadedNameSet = new Set((documents || []).map((doc) => String(doc.filename || '').trim().toLowerCase()));
        const queuedSet = new Set(files.map((f) => `${f.name.trim().toLowerCase()}::${f.file.size}`));

        incoming.forEach((f) => {
            const ext = getExtension(f.name);
            if (!ACCEPTED_EXTENSIONS.includes(ext)) {
                rejected.push(f.name);
                return;
            }
            const normalizedName = f.name.trim().toLowerCase();
            if (uploadedNameSet.has(normalizedName)) {
                alreadyUploaded.push(f.name);
                return;
            }
            const sig = `${normalizedName}::${f.size}`;
            if (queuedSet.has(sig)) {
                alreadyQueued.push(f.name);
                return;
            }
            queuedSet.add(sig);
            valid.push({
                file: f,
                name: f.name,
                size: formatSize(f.size),
                status: 'pending',
            });
        });

        if (rejected.length) {
            showToast(`Unsupported file(s): ${rejected.join(', ')}. Allowed: ${ACCEPTED_EXTENSIONS.join(', ')}`, 'error');
        }
        if (alreadyUploaded.length) {
            showToast(`Skipped already uploaded file(s): ${alreadyUploaded.join(', ')}`, 'error');
        }
        if (alreadyQueued.length) {
            showToast(`Skipped duplicate queued file(s): ${alreadyQueued.join(', ')}`);
        }

        if (!valid.length) return;

        if (mode === 'single') {
            setFiles([valid[0]]);
            if (valid.length > 1) {
                showToast('Single mode keeps only the first selected file.');
            }
            return;
        }
        setFiles((prev) => [...prev, ...valid]);
    };

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') setDragActive(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files?.length) {
            appendFiles(Array.from(e.dataTransfer.files));
        }
    }, [mode]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            appendFiles(Array.from(e.target.files));
        }
        e.currentTarget.value = '';
    };

    const openFilePicker = () => {
        fileInputRef.current?.click();
    };

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const clearCompleted = () => {
        setFiles((prev) => prev.filter((f) => f.status === 'pending' || f.status === 'uploading'));
    };

    const statusIcon = (status: UploadStatus) => {
        if (status === 'uploading') return <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />;
        if (status === 'done') return <Check className="w-3.5 h-3.5 text-emerald-400" />;
        if (status === 'error') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
        return null;
    };

    const parseTags = (input: string) =>
        input
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);

    const loadDocuments = useCallback(async () => {
        if (!token) return;
        setIsLoadingDocs(true);
        try {
            const response = await documentsApi.list(token, { page: 1, per_page: 100 });
            const sorted = [...(response.documents || [])].sort((a, b) => {
                const aa = new Date(a.uploaded_at || a.created_at || 0).getTime();
                const bb = new Date(b.uploaded_at || b.created_at || 0).getTime();
                return bb - aa;
            });
            setDocuments(sorted);
        } catch (err: any) {
            showToast(err.message || 'Failed to fetch documents.', 'error');
        } finally {
            setIsLoadingDocs(false);
        }
    }, [token, showToast]);

    useEffect(() => {
        loadDocuments();
    }, [loadDocuments]);

    useEffect(() => {
        setDocsPage(1);
    }, [documents.length]);

    const totalDocPages = Math.max(1, Math.ceil(documents.length / DOCS_PER_PAGE));
    const paginatedDocuments = useMemo(
        () =>
            documents.slice(
                (docsPage - 1) * DOCS_PER_PAGE,
                docsPage * DOCS_PER_PAGE,
            ),
        [documents, docsPage],
    );

    const handleUploadAll = async () => {
        if (!files.length || isUploading || !token) return;
        if (!canUpload) {
            showToast('Only admin and faculty can upload documents.', 'error');
            return;
        }
        if (!docTypeOptions.includes(docType)) {
            showToast('Selected audience is not allowed for your role.', 'error');
            return;
        }

        const processIndexes = files
            .map((entry, idx) => ({ entry, idx }))
            .filter(({ entry }) => entry.status === 'pending' || entry.status === 'error');
        if (!processIndexes.length) {
            showToast('No pending files to upload.');
            return;
        }

        setIsUploading(true);
        setProgress(0);
        setUploadPhase('uploading');
        setUploadLabel('Preparing upload queue...');
        setElapsedSeconds(0);

        let completed = 0;
        const total = processIndexes.length;
        let processed = 0;
        const tags = parseTags(tagsInput);
        const estimatedPerFileMs = processIndexes.map(({ entry }) =>
            Math.min(30_000, Math.max(7_000, Math.round(entry.file.size / 45_000) + 6_000)),
        );
        estimatedTotalRef.current = estimatedPerFileMs.reduce((sum, value) => sum + value, 0);
        uploadStartRef.current = Date.now();

        stopUploadTimer();
        uploadTimerRef.current = window.setInterval(() => {
            if (!uploadStartRef.current) return;
            const elapsedMs = Date.now() - uploadStartRef.current;
            const elapsed = Math.floor(elapsedMs / 1000);
            setElapsedSeconds(elapsed);
            const remaining = Math.max(0, estimatedTotalRef.current - elapsedMs);
            setEtaSeconds(Math.ceil(remaining / 1000));
            setProgress((prev) => {
                const estimateProgress = estimatedTotalRef.current > 0
                    ? Math.round((elapsedMs / estimatedTotalRef.current) * 100)
                    : prev;
                const floor = Math.round((processed / total) * 100);
                return Math.max(floor, Math.min(98, estimateProgress));
            });
        }, 400);

        for (let i = 0; i < processIndexes.length; i++) {
            const { entry: fileObj, idx: fileIndex } = processIndexes[i];
            setUploadPhase('uploading');
            setUploadLabel(`Uploading ${i + 1}/${total}: ${fileObj.name}`);
            setFiles((prev) => prev.map((f, idx) => (idx === fileIndex ? { ...f, status: 'uploading' } : f)));

            const formData = new FormData();
            formData.append('file', fileObj.file);
            formData.append('doc_type', docType);
            formData.append('department', department);
            formData.append('course', course);
            formData.append('tags', JSON.stringify(tags));
            formData.append(
                'metadata',
                JSON.stringify({
                    upload_mode: mode,
                    uploader_role: role,
                    route_targets: docType === 'public'
                        ? ['student', 'faculty', 'admin']
                        : docType === 'student'
                            ? ['student', 'admin']
                            : docType === 'faculty'
                                ? ['faculty', 'admin']
                                : ['admin'],
                })
            );

            try {
                await documentsApi.upload(token, formData);
                setUploadPhase('indexing');
                setUploadLabel(`Indexing embeddings ${i + 1}/${total}: ${fileObj.name}`);
                setFiles((prev) => prev.map((f, idx) => (idx === fileIndex ? { ...f, status: 'done' } : f)));
                completed++;
            } catch (error: any) {
                setFiles((prev) => prev.map((f, idx) => (idx === fileIndex ? { ...f, status: 'error' } : f)));
                showToast(error.message || `Failed uploading ${fileObj.name}`, 'error');
            } finally {
                processed++;
                setProgress(Math.round((processed / total) * 100));
            }
        }

        stopUploadTimer();
        setIsUploading(false);
        setUploadPhase('completed');
        setUploadLabel(completed === total ? 'Upload and indexing completed.' : 'Upload completed with some failures.');
        setEtaSeconds(0);
        setProgress(100);

        // Keep failed entries visible; hide successfully uploaded ones from queue.
        setFiles((prev) => prev.filter((f) => f.status !== 'done'));

        if (completed > 0) {
            showToast(`Uploaded ${completed}/${total} file(s).`, completed === total ? 'success' : undefined);
            await loadDocuments();
        }

        window.setTimeout(() => {
            if (!isUploading) {
                setUploadPhase('idle');
                setUploadLabel('');
                setProgress(0);
                setElapsedSeconds(0);
                setEtaSeconds(null);
            }
        }, 2200);
    };

    const startEdit = (doc: DocumentResponse) => {
        setEditingId(doc.id);
        setEditDraft({
            doc_type: doc.doc_type,
            department: doc.department || '',
            course: doc.course || '',
            tags: doc.tags || [],
            visibility: doc.visibility,
        });
    };

    const saveEdit = async (id: string) => {
        if (!token) return;
        setIsSaving(true);
        try {
            await documentsApi.update(token, id, {
                doc_type: editDraft.doc_type,
                department: editDraft.department || '',
                course: editDraft.course || '',
                tags: Array.isArray(editDraft.tags) ? editDraft.tags : [],
                visibility: editDraft.visibility ?? true,
            });
            showToast('Document updated.', 'success');
            setEditingId(null);
            setEditDraft({});
            await loadDocuments();
        } catch (err: any) {
            showToast(err.message || 'Failed to update document.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const deleteDoc = async (id: string) => {
        if (!token) return;
        try {
            await documentsApi.delete(token, id);
            showToast('Document deleted.', 'success');
            await loadDocuments();
        } catch (err: any) {
            showToast(err.message || 'Failed to delete document.', 'error');
        }
    };

    return (
        <div className="h-full overflow-y-auto p-6 sm:p-8 md:p-10 w-full">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto w-full space-y-6">
                <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-r from-[#201108] via-[#161117] to-[#0b1226] p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="inline-flex items-center rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-[10px] tracking-[0.18em] uppercase font-bold text-orange-300 mb-2">
                                Document Control Hub
                            </div>
                            <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                                    <Upload className="w-4 h-4 text-orange-400" />
                                </div>
                                Document Upload Console
                            </h1>
                            <p className="text-sm text-zinc-300 max-w-2xl">
                                Upload with role routing metadata and embed documents for RAG. Supported formats: {ACCEPTED_EXTENSIONS.join(', ')}.
                            </p>
                        </div>
                        <div className="text-right text-xs text-zinc-400">
                            <div className="font-semibold text-zinc-200">{documents.length} total docs</div>
                            <div>{queueStats.total} files in queue</div>
                        </div>
                    </div>
                </div>

                {!canUpload ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-400">
                        You are logged in as <span className="text-white font-semibold">{role}</span>. Upload is available only for admin or faculty.
                    </div>
                ) : (
                    <>
                        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-zinc-900/30 p-5 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                <HoverTooltip content="Upload exactly one file with dedicated metadata.">
                                    <button
                                        type="button"
                                        onClick={() => { setMode('single'); setFiles((prev) => prev.slice(0, 1)); }}
                                        className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${mode === 'single' ? 'bg-orange-500/15 border-orange-500/40 text-orange-200' : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-white'}`}
                                    >
                                        <FileUp className="w-3.5 h-3.5" /> Single Upload
                                    </button>
                                </HoverTooltip>
                                <HoverTooltip content="Upload multiple files together under shared routing metadata.">
                                    <button
                                        type="button"
                                        onClick={() => setMode('batch')}
                                        className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${mode === 'batch' ? 'bg-orange-500/15 border-orange-500/40 text-orange-200' : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-white'}`}
                                    >
                                        <Layers className="w-3.5 h-3.5" /> Batch Upload
                                    </button>
                                </HoverTooltip>
                            </div>
                                <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-zinc-400">
                                    <span className="text-zinc-500">Queue</span>
                                    <span className="text-white font-semibold">{queueStats.total}</span>
                                    <span className="text-zinc-600">|</span>
                                    <span className="text-emerald-400 font-semibold">{queueStats.done}</span>
                                    <span className="text-red-400 font-semibold">{queueStats.failed}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-4">
                                <div className="space-y-3">
                                    <label className="text-xs text-zinc-400 block">
                                    Audience
                                    <Select
                                        id="upload-audience"
                                        value={docType}
                                        onValueChange={setDocType}
                                        className="mt-1.5 h-10 rounded-xl bg-black/40"
                                        options={docTypeOptions.map((opt) => ({
                                            value: opt,
                                            label: opt.charAt(0).toUpperCase() + opt.slice(1),
                                        }))}
                                    />
                                </label>

                                    <label className="text-xs text-zinc-400 block">
                                    Department
                                    <input
                                        value={department}
                                        onChange={(e) => setDepartment(e.target.value)}
                                        placeholder="Computer Science"
                                        className="mt-1 w-full h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/30"
                                    />
                                </label>

                                    <label className="text-xs text-zinc-400 block">
                                    Course
                                    <input
                                        value={course}
                                        onChange={(e) => setCourse(e.target.value)}
                                        placeholder="CS101"
                                        className="mt-1 w-full h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/30"
                                    />
                                </label>

                                    <label className="text-xs text-zinc-400 block">
                                    Tags (comma separated)
                                    <input
                                        value={tagsInput}
                                        onChange={(e) => setTagsInput(e.target.value)}
                                        placeholder="exam,policy,timetable"
                                        className="mt-1 w-full h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-500/30"
                                    />
                                </label>
                                    <div className="grid grid-cols-4 gap-2 pt-1">
                                        <div className="rounded-xl border border-white/10 bg-black/40 px-2 py-2">
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</div>
                                            <div className="text-sm font-bold text-white">{queueStats.total}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-black/40 px-2 py-2">
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Pending</div>
                                            <div className="text-sm font-bold text-zinc-300">{queueStats.pending}</div>
                                        </div>
                                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-2 py-2">
                                            <div className="text-[10px] text-emerald-300 uppercase tracking-wider">Done</div>
                                            <div className="text-sm font-bold text-emerald-300">{queueStats.done}</div>
                                        </div>
                                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-2 py-2">
                                            <div className="text-[10px] text-red-300 uppercase tracking-wider">Failed</div>
                                            <div className="text-sm font-bold text-red-300">{queueStats.failed}</div>
                                        </div>
                                    </div>
                                </div>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple={mode === 'batch'}
                                    accept={ACCEPTED_ATTR}
                                    onChange={handleFileSelect}
                                    className="sr-only"
                                    tabIndex={-1}
                                    aria-hidden="true"
                                />
                                <div
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    onClick={openFilePicker}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            openFilePicker();
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={mode === 'single' ? 'Select one file to upload' : 'Select files to upload in batch'}
                                    className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 cursor-pointer min-h-[252px] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 ${dragActive ? 'border-orange-500 bg-orange-500/5 shadow-[0_0_40px_-12px_rgba(249,115,22,0.2)]' : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.15]'}`}
                                >
                                    <div className="space-y-2 pointer-events-none">
                                        <div className="w-11 h-11 mx-auto rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                                            <CloudUpload className="w-5 h-5 text-orange-400" />
                                        </div>
                                        <p className="text-sm font-semibold text-white">
                                            {mode === 'single' ? 'Select one file' : 'Drag & drop files here'}
                                        </p>
                                        <p className="text-[11px] text-zinc-500">
                                            Max 25MB each - {ACCEPTED_EXTENSIONS.join(', ')}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {files.length > 0 && (
                                <div className="space-y-2">
                                    {files.map((file, i) => (
                                        <div key={`${file.name}-${i}`} className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/[0.06]">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                                                    <FileText className="w-3.5 h-3.5 text-orange-400" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-medium text-white truncate">{file.name}</div>
                                                    <div className="text-[10px] text-zinc-600">{file.size}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {statusIcon(file.status)}
                                                <HoverTooltip content="Remove file from queue">
                                                    <button
                                                        onClick={() => removeFile(i)}
                                                        className="w-6 h-6 rounded-md hover:bg-white/5 flex items-center justify-center text-zinc-600 hover:text-white transition-colors"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </HoverTooltip>
                                            </div>
                                        </div>
                                    ))}

                                    {uploadPhase !== 'idle' && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                                <span className="text-zinc-300">{uploadLabel || 'Uploading and indexing...'}</span>
                                                <span className="text-zinc-300 font-semibold">{progress}%</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${progress}%` }}
                                                    transition={{ duration: 0.15, ease: 'easeOut' }}
                                                    className="h-full bg-gradient-to-r from-emerald-500 via-green-400 to-lime-300"
                                                />
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
                                                <span>Stage: <span className="text-emerald-300 font-semibold">{uploadPhase}</span></span>
                                                <span>Elapsed: <span className="text-zinc-300 font-semibold">{formatDuration(elapsedSeconds)}</span></span>
                                                <span>ETA: <span className="text-zinc-300 font-semibold">{etaSeconds === null ? '--:--' : formatDuration(etaSeconds)}</span></span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <Button
                                            onClick={handleUploadAll}
                                            disabled={!files.length || isUploading}
                                            title="Upload queue and trigger ingestion + embeddings."
                                            className="rounded-xl h-9 px-5 w-auto bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-semibold transition-all shadow-md shadow-orange-500/20"
                                        >
                                            {isUploading ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload
                                                </>
                                            )}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={clearCompleted}
                                            disabled={isUploading || (queueStats.done + queueStats.failed) === 0}
                                            title="Clear completed and failed files from the queue."
                                            className="rounded-xl h-9 px-4 text-xs border-white/15 text-zinc-300 hover:text-white"
                                        >
                                            Clear Completed
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-zinc-900/30 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-white">Uploaded Documents</h2>
                        <HoverTooltip content="Reload documents from server.">
                            <button
                                type="button"
                                onClick={loadDocuments}
                                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/90 hover:text-white hover:border-white/30 transition-all"
                                disabled={isLoadingDocs}
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDocs ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                        </HoverTooltip>
                    </div>

                    {isLoadingDocs ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, idx) => (
                                <div key={`doc-skeleton-${idx}`} className="rounded-xl border border-white/[0.06] bg-black/40 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1 space-y-2">
                                            <Skeleton className="h-3.5 w-56" />
                                            <Skeleton className="h-3 w-72" />
                                        </div>
                                        <div className="flex gap-1.5">
                                            <Skeleton className="w-7 h-7 rounded-lg" />
                                            <Skeleton className="w-7 h-7 rounded-lg" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="text-xs text-zinc-500">No documents uploaded yet.</div>
                    ) : (
                        <div className="space-y-2">
                            {paginatedDocuments.map((doc) => {
                                const isEditing = editingId === doc.id;
                                return (
                                    <div key={doc.id} className="rounded-xl border border-white/[0.06] bg-black/40 p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-white truncate">{doc.filename}</div>
                                                <div className="text-[10px] text-zinc-500">
                                                    {doc.doc_type} - {doc.department || 'No department'} - {doc.course || 'No course'}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {canAdminCrud && (
                                                    <>
                                                        {!isEditing ? (
                                                            <HoverTooltip content="Edit metadata">
                                                                <button
                                                                    onClick={() => startEdit(doc)}
                                                                    className="w-7 h-7 rounded-lg border border-white/10 hover:border-orange-500/40 text-zinc-400 hover:text-orange-300 flex items-center justify-center transition-all"
                                                                >
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </button>
                                                            </HoverTooltip>
                                                        ) : (
                                                            <Button
                                                                className="h-7 px-3 text-[10px] bg-emerald-600 hover:bg-emerald-500"
                                                                onClick={() => saveEdit(doc.id)}
                                                                disabled={isSaving}
                                                            >
                                                                Save
                                                            </Button>
                                                        )}
                                                        <HoverTooltip content="Delete document">
                                                            <button
                                                                onClick={() => deleteDoc(doc.id)}
                                                                className="w-7 h-7 rounded-lg border border-white/10 hover:border-red-500/40 text-zinc-400 hover:text-red-300 flex items-center justify-center transition-all"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </HoverTooltip>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {isEditing && canAdminCrud && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                <div>
                                                    <Select
                                                        value={String(editDraft.doc_type || doc.doc_type)}
                                                        onValueChange={(value) => setEditDraft((prev) => ({ ...prev, doc_type: value }))}
                                                        className="h-9 rounded-lg bg-black/40 text-xs"
                                                        options={docTypeOptions.map((opt) => ({
                                                            value: opt,
                                                            label: opt.charAt(0).toUpperCase() + opt.slice(1),
                                                        }))}
                                                    />
                                                </div>
                                                <input
                                                    value={String(editDraft.department ?? doc.department ?? '')}
                                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, department: e.target.value }))}
                                                    className="h-9 rounded-lg border border-white/10 bg-black/40 px-2.5 text-xs text-white outline-none"
                                                    placeholder="Department"
                                                />
                                                <input
                                                    value={String(editDraft.course ?? doc.course ?? '')}
                                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, course: e.target.value }))}
                                                    className="h-9 rounded-lg border border-white/10 bg-black/40 px-2.5 text-xs text-white outline-none"
                                                    placeholder="Course"
                                                />
                                                <input
                                                    value={Array.isArray(editDraft.tags) ? editDraft.tags.join(', ') : (doc.tags || []).join(', ')}
                                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) }))}
                                                    className="h-9 rounded-lg border border-white/10 bg-black/40 px-2.5 text-xs text-white outline-none"
                                                    placeholder="tags"
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!isLoadingDocs && documents.length > 0 && (
                        <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-500">
                            <span>
                                Showing{' '}
                                <span className="text-zinc-300">
                                    {(docsPage - 1) * DOCS_PER_PAGE + 1}
                                    {'-'}
                                    {Math.min(docsPage * DOCS_PER_PAGE, documents.length)}
                                </span>{' '}
                                of <span className="text-zinc-300">{documents.length}</span> documents
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setDocsPage((p) => Math.max(1, p - 1))}
                                    disabled={docsPage === 1}
                                    className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.02] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] text-xs font-medium"
                                >
                                    Prev
                                </button>
                                <HoverTooltip content="Current page">
                                    <button
                                        className="h-7 w-7 rounded-lg text-xs font-semibold transition-colors bg-orange-600 text-white"
                                    >
                                        {docsPage}
                                    </button>
                                </HoverTooltip>
                                <span className="text-zinc-600">/ {totalDocPages}</span>
                                <button
                                    onClick={() => setDocsPage((p) => Math.min(totalDocPages, p + 1))}
                                    disabled={docsPage === totalDocPages}
                                    className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.02] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.08] text-xs font-medium"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default UploadPage;


