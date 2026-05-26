"use client";

import { useEffect, useRef } from "react";
import { X, Volume2, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface SidePanelData {
  imageUrl: string;
  fileName: string;
  markdown: string;
  ttsDescription: string;
  extractionStatus: "idle" | "processing" | "done" | "error";
  error?: string;
}

interface SidePanelProps {
  open: boolean;
  data: SidePanelData | null;
  onClose: () => void;
  onPlayTTS: (text: string) => void;
}

export function SidePanel({ open, data, onClose, onPlayTTS }: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !data) return null;

  return (
    <div
      ref={panelRef}
      className="w-[420px] shrink-0 border-l border-border bg-surface h-full flex flex-col
        animate-slide-in-right overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-accent shrink-0" />
          <span className="text-sm font-medium text-text truncate">
            {data.fileName}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-notion text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Image preview */}
        <div className="p-4 border-b border-border">
          <img
            src={data.imageUrl}
            alt={data.fileName}
            className="w-full rounded-notion border border-border object-contain max-h-48"
          />
        </div>

        {/* Extraction status */}
        {data.extractionStatus === "processing" && (
          <div className="px-4 py-3 border-b border-border bg-accent-muted">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin-slow" />
              <span className="text-sm text-accent-text">
                Extracting document structure...
              </span>
            </div>
          </div>
        )}

        {data.extractionStatus === "error" && (
          <div className="px-4 py-3 border-b border-border bg-danger-muted">
            <p className="text-sm text-danger">{data.error || "Extraction failed"}</p>
          </div>
        )}

        {/* TTS Description */}
        {data.ttsDescription && (
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                TTS will read
              </span>
              <button
                onClick={() => onPlayTTS(data.ttsDescription)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-notion text-xs
                  text-accent-text bg-accent-muted hover:bg-accent/20"
              >
                <Volume2 size={12} />
                <span>Preview</span>
              </button>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed italic">
              &ldquo;{data.ttsDescription}&rdquo;
            </p>
          </div>
        )}

        {/* Markdown content */}
        {data.markdown && (
          <div className="px-4 py-3">
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2 block">
              Extracted Content
            </span>
            <div className="prose prose-sm dark:prose-invert max-w-none
              prose-headings:text-text prose-p:text-text-secondary
              prose-strong:text-text prose-code:text-accent-text
              prose-th:text-text-secondary prose-td:text-text-secondary
              prose-blockquote:border-border prose-hr:border-border">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.markdown}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!data.markdown && data.extractionStatus === "done" && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-text-tertiary">
              No structured content could be extracted from this image.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
