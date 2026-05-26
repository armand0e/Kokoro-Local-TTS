"use client";

import { useTheme } from "@/hooks/useTheme";
import {
  Play,
  Square,
  Download,
  Settings,
  Sun,
  Moon,
  Loader2,
  Volume2,
} from "lucide-react";

interface ToolbarProps {
  isModelReady: boolean;
  isLoading: boolean;
  mode: "none" | "stream" | "download";
  progress: number;
  progressText: string;
  onStream: () => void;
  onStop: () => void;
  onDownload: () => void;
  onSettingsToggle: () => void;
  settingsOpen: boolean;
}

export function Toolbar({
  isModelReady,
  isLoading,
  mode,
  progress,
  progressText,
  onStream,
  onStop,
  onDownload,
  onSettingsToggle,
  settingsOpen,
}: ToolbarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex items-center h-12 px-4 border-b border-border bg-surface shrink-0">
      {/* Left: branding + status */}
      <div className="flex items-center gap-3 min-w-0">
        <Volume2 size={18} className="text-accent shrink-0" />
        <span className="font-semibold text-sm text-text truncate">
          Kokoro TTS
        </span>

        {/* Model status indicator */}
        {isLoading ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-tertiary">
            <Loader2 size={12} className="text-text-secondary animate-spin-slow" />
            <span className="text-xs text-text-secondary whitespace-nowrap">
              {progressText}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success-muted">
            <div className="w-1.5 h-1.5 rounded-full bg-success" />
            <span className="text-xs text-success font-medium">Ready</span>
          </div>
        )}
      </div>

      {/* Center: progress bar when active */}
      {mode !== "none" && (
        <div className="flex-1 mx-6 max-w-md">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-surface-tertiary overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
              />
            </div>
            <span className="text-xs text-text-secondary whitespace-nowrap">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      )}

      {/* Spacer */}
      {mode === "none" && <div className="flex-1" />}

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        {/* Stream / Stop button */}
        {mode === "stream" ? (
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-notion text-sm font-medium
              bg-danger text-white hover:bg-danger/90"
          >
            <Square size={14} />
            <span>Stop</span>
          </button>
        ) : (
          <button
            onClick={onStream}
            disabled={!isModelReady || mode === "download"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-notion text-sm font-medium
              bg-accent text-text-inverted hover:bg-accent-hover
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin-slow" />
            ) : (
              <Play size={14} />
            )}
            <span>Play</span>
          </button>
        )}

        {/* Download */}
        <button
          onClick={onDownload}
          disabled={!isModelReady || mode === "stream"}
          title="Download audio file"
          className="p-1.5 rounded-notion text-text-secondary hover:bg-surface-hover
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {mode === "download" ? (
            <Loader2 size={18} className="animate-spin-slow" />
          ) : (
            <Download size={18} />
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-border mx-1" />

        {/* Settings */}
        <button
          onClick={onSettingsToggle}
          title="Voice & speed settings"
          className={`p-1.5 rounded-notion transition-colors ${
            settingsOpen
              ? "bg-accent-muted text-accent-text"
              : "text-text-secondary hover:bg-surface-hover"
          }`}
        >
          <Settings size={18} />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          className="p-1.5 rounded-notion text-text-secondary hover:bg-surface-hover"
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>
    </header>
  );
}
