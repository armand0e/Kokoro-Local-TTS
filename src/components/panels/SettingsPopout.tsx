"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface VoiceInfo {
  name: string;
  language: string;
  gender: "Male" | "Female";
  traits?: string;
}

interface SettingsPopoutProps {
  open: boolean;
  onClose: () => void;
  voices: Record<string, VoiceInfo>;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  disabled: boolean;
}

export function SettingsPopout({
  open,
  onClose,
  voices,
  selectedVoice,
  onVoiceChange,
  speed,
  onSpeedChange,
  disabled,
}: SettingsPopoutProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to prevent immediate close from the toggle button click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const voiceEntries = Object.entries(voices);
  const selectedInfo = voices[selectedVoice];

  return (
    <div
      ref={panelRef}
      className="absolute top-12 right-2 z-50 w-72 bg-[var(--popout-bg)] border border-border
        rounded-lg shadow-popout animate-scale-in origin-top-right"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium text-text">Settings</span>
        <button
          onClick={onClose}
          className="p-1 rounded-notion text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* Voice selection */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Voice
          </label>
          <select
            value={selectedVoice}
            onChange={(e) => onVoiceChange(e.target.value)}
            disabled={disabled}
            className="w-full px-2.5 py-1.5 text-sm rounded-notion border border-border
              bg-surface text-text focus-ring
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {voiceEntries.length === 0 ? (
              <option>Loading...</option>
            ) : (
              voiceEntries.map(([id, voice]) => (
                <option key={id} value={id}>
                  {voice.traits ? `${voice.traits} ` : ""}
                  {voice.name} ({voice.language}, {voice.gender})
                </option>
              ))
            )}
          </select>
          {selectedInfo && (
            <p className="mt-1 text-xs text-text-tertiary">
              {selectedInfo.name} - {selectedInfo.language} {selectedInfo.gender}
            </p>
          )}
        </div>

        {/* Speed control */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Speed
            </label>
            <span className="text-xs font-mono text-text-tertiary bg-surface-tertiary px-1.5 py-0.5 rounded">
              {speed.toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-text-tertiary mt-0.5">
            <span>0.5x</span>
            <span>1.0x</span>
            <span>2.0x</span>
          </div>
        </div>
      </div>
    </div>
  );
}
