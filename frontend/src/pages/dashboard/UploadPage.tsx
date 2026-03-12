import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    Check,
    CloudUpload,
    FileText,
    Loader2,
    Shield,
    Sparkles,
    Tag,
    Upload,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { documentsApi } from '@/lib/api';

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';
type DocAudience = 'student' | 'faculty' | 'admin' | 'public';

interface QueuedFile {
    file: File;
    name: string;
    size: string;
    status: UploadStatus;
    error?: string;
}

const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const getFileExtension = (filename: string) => filename.split('.').pop()?.toLowerCase() || '';

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getDefaultAudience = (role?: string): DocAudience => {
    if (role === 'admin') return 'public';
    if (role === 'faculty') return 'student';
    return 'public';
};

const getAudienceOptions = (role?: string) => {
    if (role === 'admin') {
        return [
            { value: 'public' as const, label: 'Public', hint: 'Visible to everyone on campus' },
            { value: 'student' as const, label: 'Student', hint: 'Only student-facing answers can use this' },
            { value: 'faculty' as const, label: 'Faculty', hint: 'Only faculty-facing answers can use this' },
            { value: 'admin' as const, label: 'Admin', hint: 'Restricted to admin workflows' },
        ];
    }

    if (role === 'faculty') {
        return [
            { value: 'student' as const, label: 'Student', hint: 'Course material and notes for students' },
            { value: 'faculty' as const, label: 'Faculty', hint: 'Internal faculty-only material' },
            { value: 'public' as const, label: 'Public', hint: 'Campus-wide announcements and policies' },
        ];
    }

    return [];
};

const UploadPage = () => {
    const { token, user } = useAuthStore();
    const { showToast } = useToastStore();
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState<QueuedFile[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [department, setDepartment] = useState(user?.department || '');
    const [course, setCourse] = useState('');
    const [tagsInput, setTagsInput] = useState('');
    const [docType, setDocType] = useState<DocAudience>(getDefaultAudience(user?.role));

    const audienceOptions = getAudienceOptions(user?.role);
    const canUpload = user?.role === 'admin' || user?.role === 'faculty';
    const parsedTags = tagsInput
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .filter((tag, index, arr) => arr.indexOf(tag) === index);

    useEffect(() => {
        if (user?.department && !department) {
            setDepartment(user.department);
        }

        const allowedValues = new Set(getAudienceOptions(user?.role).map((option) => option.value));
        if (allowedValues.size && !allowedValues.has(docType)) {
            setDocType(getDefaultAudience(user?.role));
        }
    }, [department, docType, user?.department, user?.role]);

    const queueIncomingFiles = useCallback(
        (incomingFiles: File[]) => {
            const existingKeys = new Set(files.map((entry) => `${entry.file.name}-${entry.file.size}-${entry.file.lastModified}`));
            const nextFiles: QueuedFile[] = [];

            for (const file of incomingFiles) {
                const key = `${file.name}-${file.size}-${file.lastModified}`;
                const extension = getFileExtension(file.name);

                if (existingKeys.has(key)) {
                    showToast(`${file.name} is already in the queue.`);
                    continue;
                }

                if (!SUPPORTED_EXTENSIONS.includes(extension)) {
                    showToast(`${file.name} is not supported. Use PDF, DOCX, TXT, or MD.`);
                    continue;
                }

                if (file.size > MAX_FILE_SIZE_BYTES) {
                    showToast(`${file.name} is larger than 25 MB.`);
                    continue;
                }

                existingKeys.add(key);
                nextFiles.push({
                    file,
                    name: file.name,
                    size: formatSize(file.size),
                    status: 'pending',
                });
            }

            if (nextFiles.length) {
                setFiles((prev) => [...prev, ...nextFiles]);
            }
        },
        [files, showToast]
    );

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);
            if (e.dataTransfer.files?.length) {
                queueIncomingFiles(Array.from(e.dataTransfer.files));
            }
        },
        [queueIncomingFiles]
    );

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            queueIncomingFiles(Array.from(e.target.files));
            e.target.value = '';
        }
    };

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const statusIcon = (status: UploadStatus) => {
        switch (status) {
            case 'uploading':
                return <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />;
            case 'done':
                return <Check className="w-3.5 h-3.5 text-emerald-400" />;
            case 'error':
                return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
            default:
                return null;
        }
    };

    const handleUploadAll = async () => {
        if (!files.length || isUploading || !token || !canUpload) return;

        setIsUploading(true);
        setProgress(0);

        let completed = 0;
        const total = files.filter((file) => file.status !== 'done').length || files.length;

        for (let i = 0; i < files.length; i++) {
            const fileObj = files[i];
            if (fileObj.status === 'done') continue;

            setFiles((prev) =>
                prev.map((file, idx) => (idx === i ? { ...file, status: 'uploading', error: undefined } : file))
            );

            const formData = new FormData();
            formData.append('file', fileObj.file);
            formData.append('doc_type', docType);
            formData.append('department', department.trim());
            formData.append('course', course.trim());
            formData.append('tags', JSON.stringify(parsedTags));
            formData.append(
                'metadata',
                JSON.stringify({
                    audience: docType,
                    uploader_role: user?.role || 'unknown',
                    mime_type: fileObj.file.type || 'application/octet-stream',
                    extension: getFileExtension(fileObj.file.name),
                })
            );

            try {
                await documentsApi.upload(token, formData);
                completed += 1;
                setProgress(Math.round((completed / total) * 100));
                setFiles((prev) => prev.map((file, idx) => (idx === i ? { ...file, status: 'done' } : file)));
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Upload failed';
                setFiles((prev) =>
                    prev.map((file, idx) => (idx === i ? { ...file, status: 'error', error: message } : file))
                );
            }
        }

        setIsUploading(false);

        if (completed > 0) {
            showToast(`Uploaded ${completed} document${completed > 1 ? 's' : ''} successfully.`, 'success');
        }
    };

    if (!canUpload) {
        return (
            <div className="p-6 sm:p-8 md:p-10 w-full">
                <div className="max-w-3xl mx-auto rounded-[2rem] border border-white/10 bg-zinc-950/80 p-8 text-center shadow-[0_0_60px_-24px_rgba(249,115,22,0.28)]">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10">
                        <Shield className="h-6 w-6 text-orange-400" />
                    </div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-white">Upload access is restricted</h1>
                    <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                        Students can query documents, but only faculty and admins can add institutional content to the
                        knowledge base.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 sm:p-8 md:p-10 w-full">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto w-full space-y-6">
                <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.16),_transparent_32%),linear-gradient(180deg,rgba(24,24,27,0.92),rgba(9,9,11,0.96))] p-6 sm:p-8 shadow-[0_0_70px_-30px_rgba(249,115,22,0.35)]">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl">
                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-300">
                                <Sparkles className="h-3.5 w-3.5" />
                                Document Ingestion
                            </div>
                            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                                Upload content with proper routing, tags, and structure
                            </h1>
                            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                                Every file you upload here is routed by audience, pushed into the document pipeline, and
                                prepared for retrieval in chat.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-left sm:grid-cols-3">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Formats</div>
                                <div className="mt-1 text-sm font-semibold text-white">PDF, DOCX, TXT, MD</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Limit</div>
                                <div className="mt-1 text-sm font-semibold text-white">25 MB each</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 col-span-2 sm:col-span-1">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Uploader</div>
                                <div className="mt-1 text-sm font-semibold capitalize text-white">{user?.role}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 sm:p-6">
                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            className={`group relative overflow-hidden rounded-[1.75rem] border p-8 text-center transition-all duration-300 ${dragActive
                                ? 'border-orange-500 bg-orange-500/6 shadow-[0_0_40px_-16px_rgba(249,115,22,0.28)]'
                                : 'border-white/10 bg-white/[0.02] hover:border-orange-500/30 hover:bg-white/[0.03]'}`}
                        >
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.14),_transparent_45%)]" />
                            <input
                                type="file"
                                multiple
                                accept=".pdf,.docx,.txt,.md"
                                onChange={handleFileSelect}
                                className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
                            />
                            <div className="relative z-10 space-y-4">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10 transition-transform duration-300 group-hover:scale-105">
                                    <CloudUpload className="h-6 w-6 text-orange-400" />
                                </div>
                                <div>
                                    <p className="text-lg font-bold tracking-tight text-white">Drop files here or click to browse</p>
                                    <p className="mt-2 text-sm text-zinc-500">
                                        Clean uploads only. Unsupported formats are blocked before they hit the backend.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {files.length > 0 && (
                            <div className="mt-5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Queued Files</span>
                                    <span className="text-xs text-zinc-400">{files.length} selected</span>
                                </div>

                                <div className="space-y-2">
                                    {files.map((file, index) => (
                                        <motion.div
                                            key={`${file.name}-${index}`}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`rounded-2xl border px-4 py-3 ${file.status === 'uploading'
                                                ? 'border-orange-500/40 bg-orange-500/[0.04]'
                                                : 'border-white/10 bg-white/[0.02]'}`}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex min-w-0 items-start gap-3">
                                                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10">
                                                        <FileText className="h-4 w-4 text-orange-400" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-semibold text-white">{file.name}</div>
                                                        <div className="mt-1 text-xs text-zinc-500">{file.size}</div>
                                                        {file.error && <div className="mt-2 text-xs text-red-400">{file.error}</div>}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {statusIcon(file.status)}
                                                    <button
                                                        onClick={() => removeFile(index)}
                                                        disabled={file.status === 'uploading'}
                                                        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                {isUploading && (
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                                        <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                                            <span>Uploading and indexing documents</span>
                                            <span className="font-semibold text-white">{progress}%</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${progress}%` }}
                                                transition={{ duration: 0.15, ease: 'easeOut' }}
                                                className="h-full bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-5 sm:p-6">
                        <div className="mb-5">
                            <h2 className="text-lg font-bold tracking-tight text-white">Routing Controls</h2>
                            <p className="mt-2 text-sm leading-6 text-zinc-400">
                                Choose who can retrieve the document and add metadata that helps the RAG pipeline keep
                                results accurate.
                            </p>
                        </div>

                        <div className="space-y-5">
                            <label className="block">
                                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                                    Audience
                                </span>
                                <select
                                    value={docType}
                                    onChange={(e) => setDocType(e.target.value as DocAudience)}
                                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-orange-500/40"
                                >
                                    {audienceOptions.map((option) => (
                                        <option key={option.value} value={option.value} className="bg-zinc-950 text-white">
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-2 text-xs text-zinc-500">
                                    {audienceOptions.find((option) => option.value === docType)?.hint}
                                </p>
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                                    Department
                                </span>
                                <input
                                    value={department}
                                    onChange={(e) => setDepartment(e.target.value)}
                                    placeholder="Computer Science"
                                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-orange-500/40"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                                    Course / Collection
                                </span>
                                <input
                                    value={course}
                                    onChange={(e) => setCourse(e.target.value)}
                                    placeholder="CS301 or Admissions 2026"
                                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-orange-500/40"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                                    Tags
                                </span>
                                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition focus-within:border-orange-500/40">
                                    <input
                                        value={tagsInput}
                                        onChange={(e) => setTagsInput(e.target.value)}
                                        placeholder="syllabus, semester-1, deadlines"
                                        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                                    />
                                    {parsedTags.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {parsedTags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="inline-flex items-center gap-1 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-300"
                                                >
                                                    <Tag className="h-3 w-3" />
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </label>

                            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                                    Upload Routing Summary
                                </div>
                                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-zinc-500">Audience</span>
                                        <span className="capitalize text-white">{docType}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-zinc-500">Department</span>
                                        <span className="text-white">{department || 'Not set'}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-zinc-500">Course</span>
                                        <span className="text-white">{course || 'General'}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-zinc-500">Tags</span>
                                        <span className="text-right text-white">{parsedTags.length ? parsedTags.join(', ') : 'Auto + manual'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    onClick={handleUploadAll}
                                    disabled={!files.length || isUploading}
                                    className="h-11 min-w-[190px] rounded-2xl bg-orange-600 px-5 text-sm font-semibold text-white shadow-[0_0_30px_-14px_rgba(249,115,22,0.65)] transition-all hover:bg-orange-500 disabled:opacity-40"
                                >
                                    {isUploading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="mr-2 h-4 w-4" />
                                            Upload Queue
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default UploadPage;
