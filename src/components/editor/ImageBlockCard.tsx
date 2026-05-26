"use client";

import { X, Loader2, CheckCircle, AlertCircle, Eye } from "lucide-react";

interface ImageEntry {
  id: string;
  dataUrl: string;
  fileName: string;
  markdown: string;
  ttsDescription: string;
  extractionStatus: "idle" | "processing" | "done" | "error";
  error?: string;
}

interface ImageBlockCardProps {
  image: ImageEntry;
  onClick: () => void;
  onRemove: () => void;
}

export function ImageBlockCard({ image, onClick, onRemove }: ImageBlockCardProps) {
  return (
    <div
      className="relative group shrink-0 w-36 rounded-notion border border-border
        bg-surface overflow-hidden cursor-pointer hover:border-accent
        transition-colors"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="h-20 bg-surface-tertiary overflow-hidden">
        <img
          src={image.dataUrl}
          alt={image.fileName}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Info bar */}
      <div className="px-2 py-1.5 flex items-center gap-1.5">
        {/* Status icon */}
        {image.extractionStatus === "processing" && (
          <Loader2 size={12} className="text-accent animate-spin-slow shrink-0" />
        )}
        {image.extractionStatus === "done" && (
          <CheckCircle size={12} className="text-success shrink-0" />
        )}
        {image.extractionStatus === "error" && (
          <AlertCircle size={12} className="text-danger shrink-0" />
        )}

        {/* File name */}
        <span className="text-[11px] text-text-secondary truncate flex-1">
          {image.fileName}
        </span>

        {/* View button */}
        <Eye
          size={12}
          className="text-text-tertiary group-hover:text-accent shrink-0"
        />
      </div>

      {/* Remove button (top-right on hover) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-1 right-1 p-0.5 rounded bg-surface/80 text-text-tertiary
          opacity-0 group-hover:opacity-100 hover:bg-danger hover:text-white
          transition-all"
      >
        <X size={12} />
      </button>
    </div>
  );
}
