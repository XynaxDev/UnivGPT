/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X, Paperclip, ExternalLink, Download, Share2 } from 'lucide-react';
import { type DocumentPreviewResponse } from '@/lib/api';

function buildDocumentBody(previewDoc: DocumentPreviewResponse) {
    if (previewDoc.notice_message?.trim()) {
        return previewDoc.notice_message.trim();
    }
    if (previewDoc.chunks?.length) {
        return previewDoc.chunks
            .slice()
            .sort((a, b) => a.chunk_index - b.chunk_index)
            .map((chunk) => chunk.content?.trim() || '')
            .filter(Boolean)
            .join('\n\n');
    }
    return '';
}

export function DocumentPreviewModal({
    isOpen,
    previewDoc,
    isLoading,
    onClose,
    onOpenAttachment,
    isAttachmentLoading = false,
    pendingTitle,
    pendingSubtitle,
}: {
    isOpen: boolean;
    previewDoc: DocumentPreviewResponse | null;
    isLoading?: boolean;
    onClose: () => void;
    onOpenAttachment?: () => void;
    isAttachmentLoading?: boolean;
    pendingTitle?: string;
    pendingSubtitle?: string;
}) {
    const [isViewerLoading, setIsViewerLoading] = useState(false);
    const [shareState, setShareState] = useState<'idle' | 'copied' | 'shared'>('idle');

    const viewerUrl = previewDoc?.viewer_url || previewDoc?.file_url || null;
    const downloadUrl = previewDoc?.download_url || previewDoc?.file_url || null;

    const title = previewDoc?.notice_title || previewDoc?.filename || pendingTitle || 'Loading document...';
    const subtitle = previewDoc
        ? `${previewDoc.course || 'General'} · ${previewDoc.department || 'No department'} · ${previewDoc.doc_type}`
        : pendingSubtitle || 'Preparing preview...';

    const isPdfLike = useMemo(() => {
        const mime = String(previewDoc?.mime_type || '').toLowerCase();
        const filename = String(previewDoc?.filename || '').toLowerCase();
        return Boolean(viewerUrl) && (mime.includes('pdf') || filename.endsWith('.pdf'));
    }, [viewerUrl, previewDoc?.mime_type, previewDoc?.filename]);

    const isImageLike = useMemo(() => {
        const mime = String(previewDoc?.mime_type || '').toLowerCase();
        const filename = String(previewDoc?.filename || '').toLowerCase();
        return Boolean(viewerUrl) && (
            mime.startsWith('image/') ||
            ['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => filename.endsWith(ext))
        );
    }, [viewerUrl, previewDoc?.mime_type, previewDoc?.filename]);

    const supportsEmbeddedViewer = Boolean(viewerUrl) && !isImageLike;

    useEffect(() => {
        if (!isOpen) {
            setIsViewerLoading(false);
            setShareState('idle');
            return;
        }
        setIsViewerLoading(Boolean(viewerUrl));
    }, [isOpen, viewerUrl]);

    const handleShare = async () => {
        if (!viewerUrl) return;
        try {
            if (navigator.share) {
                await navigator.share({
                    title,
                    text: subtitle,
                    url: viewerUrl,
                });
                setShareState('shared');
            } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(viewerUrl);
                setShareState('copied');
            }
            window.setTimeout(() => setShareState('idle'), 1800);
        } catch {
            setShareState('idle');
        }
    };

    if (!isOpen) return null;

    const documentBody = previewDoc ? buildDocumentBody(previewDoc) : '';
    const paragraphs = documentBody
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);

    const modalContent = (
        <div className="fixed inset-0 z-[180] bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-5 overflow-hidden">
            <div className="w-full max-w-6xl max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2.5rem)] rounded-[28px] border border-white/[0.12] bg-[#0b0c10] shadow-[0_24px_80px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-white/[0.08] flex items-start justify-between gap-3 sticky top-0 z-20 bg-[#0b0c10]/95 backdrop-blur-xl">
                    <div className="min-w-0">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 mb-2">
                            <FileText className="w-3.5 h-3.5 text-orange-400" />
                            Document View
                        </div>
                        <p className="text-base font-bold text-white truncate">{title}</p>
                        <p className="text-[11px] text-zinc-500 mt-1">{subtitle}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 px-3 rounded-xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.08] text-xs text-white inline-flex items-center gap-1.5"
                    >
                        <X className="w-3.5 h-3.5" />
                        Close
                    </button>
                </div>

                <div className="px-4 py-4 bg-[#090a0d] overflow-y-auto">
                    {isLoading ? (
                        <div className="rounded-[22px] border border-white/[0.08] bg-[#111214] min-h-[72vh] flex flex-col items-center justify-center gap-3">
                            <div className="relative w-9 h-9">
                                <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-400 animate-spin" />
                            </div>
                            <p className="text-sm font-semibold text-white">Loading document preview...</p>
                        </div>
                    ) : supportsEmbeddedViewer && viewerUrl ? (
                        <div className="relative rounded-[22px] border border-white/[0.08] bg-[#111214] p-3">
                            {isViewerLoading && (
                                <div className="absolute inset-3 z-10 rounded-[18px] bg-[#0f1116]/92 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                                    <div className="relative w-9 h-9">
                                        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-400 animate-spin" />
                                    </div>
                                    <p className="text-sm font-semibold text-white">
                                        {isPdfLike ? 'Opening PDF viewer...' : 'Opening document viewer...'}
                                    </p>
                                </div>
                            )}
                            <div className="flex flex-wrap items-center justify-end gap-2 pb-3">
                                <button
                                    type="button"
                                    onClick={handleShare}
                                    disabled={!viewerUrl}
                                    className="h-9 px-3 rounded-xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.08] disabled:opacity-40 text-xs text-white inline-flex items-center gap-1.5"
                                >
                                    <Share2 className="w-3.5 h-3.5" />
                                    {shareState === 'copied' ? 'Link Copied' : shareState === 'shared' ? 'Shared' : 'Share'}
                                </button>
                                <a
                                    href={downloadUrl || viewerUrl || '#'}
                                    download={previewDoc?.filename || 'document'}
                                    className="h-9 px-3 rounded-xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.08] text-xs text-white inline-flex items-center gap-1.5"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                </a>
                                <a
                                    href={viewerUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="h-9 px-3 rounded-xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.08] text-xs text-white inline-flex items-center gap-1.5"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Open In New Tab
                                </a>
                            </div>
                            <iframe
                                key={viewerUrl}
                                src={`${viewerUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
                                title={title}
                                onLoad={() => setIsViewerLoading(false)}
                                className="w-full h-[78vh] rounded-[18px] bg-white"
                            />
                            {!isPdfLike && (
                                <div className="pt-3 text-[11px] text-zinc-500">
                                    If your browser cannot render this file inline, use Download or Open In New Tab.
                                </div>
                            )}
                        </div>
                    ) : isImageLike && viewerUrl ? (
                        <div className="relative rounded-[22px] border border-white/[0.08] bg-[#111214] p-3">
                            {isViewerLoading && (
                                <div className="absolute inset-3 z-10 rounded-[18px] bg-[#0f1116]/92 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                                    <div className="relative w-9 h-9">
                                        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-400 animate-spin" />
                                    </div>
                                    <p className="text-sm font-semibold text-white">Loading document asset...</p>
                                </div>
                            )}
                            <div className="flex flex-wrap items-center justify-end gap-2 pb-3">
                                <button
                                    type="button"
                                    onClick={handleShare}
                                    disabled={!viewerUrl}
                                    className="h-9 px-3 rounded-xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.08] disabled:opacity-40 text-xs text-white inline-flex items-center gap-1.5"
                                >
                                    <Share2 className="w-3.5 h-3.5" />
                                    {shareState === 'copied' ? 'Link Copied' : shareState === 'shared' ? 'Shared' : 'Share'}
                                </button>
                                <a
                                    href={downloadUrl || viewerUrl || '#'}
                                    download={previewDoc?.filename || 'document'}
                                    className="h-9 px-3 rounded-xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.08] text-xs text-white inline-flex items-center gap-1.5"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                </a>
                            </div>
                            <div className="rounded-[18px] overflow-hidden bg-black/50 min-h-[60vh] flex items-center justify-center">
                                <img
                                    src={viewerUrl}
                                    alt={title}
                                    className="max-h-[72vh] w-auto object-contain"
                                    onLoad={() => setIsViewerLoading(false)}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="max-h-[78vh] overflow-y-auto rounded-[22px] border border-white/[0.08] bg-[#111214] p-4">
                            <div className="mx-auto max-w-[820px] min-h-[68vh] rounded-[24px] bg-white text-zinc-900 shadow-[0_20px_60px_rgba(0,0,0,0.35)] px-6 py-8 sm:px-10">
                                <div className="border-b border-zinc-200 pb-5 mb-6">
                                    <h2 className="text-2xl font-black tracking-tight text-zinc-900">{title}</h2>
                                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
                                        <span>Type: {previewDoc?.doc_type || 'document'}</span>
                                        <span>Course: {previewDoc?.course || 'General'}</span>
                                        <span>Department: {previewDoc?.department || 'Not specified'}</span>
                                    </div>
                                </div>

                                {paragraphs.length > 0 ? (
                                    <div className="space-y-4 text-[15px] leading-7 text-zinc-800">
                                        {paragraphs.map((paragraph, index) => (
                                            <p key={`${previewDoc?.id || 'pending'}-paragraph-${index}`} className="whitespace-pre-wrap break-words">
                                                {paragraph}
                                            </p>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-6 text-sm text-zinc-600">
                                        Original file preview is not available for this document yet. Showing extracted preview fallback when available. Re-uploading this file will enable the full PDF viewer experience.
                                    </div>
                                )}

                                {viewerUrl && (
                                    <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={handleShare}
                                            className="h-9 px-3 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs text-zinc-900 inline-flex items-center gap-1.5"
                                        >
                                            <Share2 className="w-3.5 h-3.5" />
                                            {shareState === 'copied' ? 'Link Copied' : shareState === 'shared' ? 'Shared' : 'Share'}
                                        </button>
                                        <a
                                            href={downloadUrl || viewerUrl || '#'}
                                            download={previewDoc?.filename || 'document'}
                                            className="h-9 px-3 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs text-zinc-900 inline-flex items-center gap-1.5"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Download
                                        </a>
                                        <a
                                            href={viewerUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="h-9 px-3 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs text-zinc-900 inline-flex items-center gap-1.5"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Open Original
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {previewDoc?.attachment_document_id && onOpenAttachment && (
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={onOpenAttachment}
                                className="h-10 px-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/15 text-xs font-semibold text-cyan-200 inline-flex items-center gap-2"
                            >
                                <Paperclip className="w-3.5 h-3.5" />
                                {isAttachmentLoading
                                    ? 'Opening attachment...'
                                    : previewDoc.attachment_filename
                                        ? `Open Attachment: ${previewDoc.attachment_filename}`
                                        : 'Open Attachment'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
