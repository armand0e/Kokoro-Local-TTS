"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
import {
  StopIcon,
  DownloadIcon,
  LoadingIcon,
  SpeakerIcon,
  SpeedIcon,
  UserIcon,
  TextIcon,
  ImageIcon,
  CheckIcon,
  WaveformIcon,
} from "./Icons";
import {
  buildSpeechPlan,
  createEmptyTextBlock,
  createImageBlock,
  ensureEditorBlocks,
  toTTSRequestBlocks,
  type EditorBlock,
  type ImageBlock,
  type SpeechPlanItem,
} from "@/lib/editor-blocks";

interface VoiceInfo {
  name: string;
  language: string;
  gender: "Male" | "Female";
  traits?: string;
}

interface TTSStatus {
  ready: boolean;
  loading?: boolean;
  progress?: number;
  statusText?: string;
  voices: Record<string, VoiceInfo>;
  sampleRate: number;
}

type Mode = "none" | "stream" | "download";

const SAMPLE_RATE = 24000;

function setTextareaHeight(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${Math.max(element.scrollHeight, 32)}px`;
}

function decodeAudioChunk(base64Audio: string): Float32Array {
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const floatCount = Math.floor(bytes.byteLength / 4);
  return new Float32Array(bytes.buffer, bytes.byteOffset, floatCount);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export function TTSClient() {
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => [createEmptyTextBlock()]);
  const [selectedVoice, setSelectedVoice] = useState("af_heart");
  const [speed, setSpeed] = useState(1.0);
  const [status, setStatus] = useState<TTSStatus | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("Loading model...");
  const [isLoading, setIsLoading] = useState(true);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeSpeechLabel, setActiveSpeechLabel] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Array<{ buffer: AudioBuffer; blockId: string; label: string }>>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const streamCompletedRef = useRef(false);
  const streamSessionIdRef = useRef(0);
  const requestSpeechPlanRef = useRef<SpeechPlanItem[]>([]);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const focusRequestRef = useRef<{ blockId: string; caret: "start" | "end" } | null>(null);
  const focusedBlockIdRef = useRef<string | null>(null);

  // Check model status on mount
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const response = await fetch("/api/tts", { cache: "no-store" });
        const data: TTSStatus = await response.json();
        if (cancelled) return;

        setStatus(data);

        const pct = typeof data.progress === "number" ? data.progress : 0;
        const isReady = !!data.ready;
        const isLoadingNow = data.loading ?? !isReady;

        if (isReady) {
          setIsLoading(false);
          setProgress(100);
          setProgressText("Model ready");
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          return;
        }

        setIsLoading(true);
        setProgress(pct);
        setProgressText(
          isLoadingNow
            ? `Loading model... ${Math.round(pct)}%`
            : "Starting model..."
        );
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to check TTS status:", error);
        setIsLoading(true);
        setProgress(0);
        setProgressText("Error loading model");
      }
    };

    poll();
    interval = setInterval(poll, 1500);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    Object.values(textareaRefs.current).forEach((element) => {
      if (element) {
        setTextareaHeight(element);
      }
    });
  }, [blocks]);

  useEffect(() => {
    if (!focusRequestRef.current) return;

    const { blockId, caret } = focusRequestRef.current;
    const element = textareaRefs.current[blockId];
    if (!element) return;

    focusRequestRef.current = null;
    element.focus();
    const position = caret === "start" ? 0 : element.value.length;

    try {
      element.setSelectionRange(position, position);
    } catch {
    }

    setTextareaHeight(element);
  }, [blocks]);

  // Initialize AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    return audioContextRef.current;
  }, []);

  const focusTextBlock = useCallback((blockId: string, caret: "start" | "end" = "end") => {
    focusRequestRef.current = { blockId, caret };
  }, []);

  const updateTextBlock = useCallback((blockId: string, value: string) => {
    setBlocks((currentBlocks) =>
      currentBlocks.map((block) =>
        block.id === blockId && block.type === "text"
          ? { ...block, text: value }
          : block
      )
    );
  }, []);

  const updateImageBlock = useCallback((blockId: string, updater: (block: ImageBlock) => ImageBlock) => {
    setBlocks((currentBlocks) =>
      currentBlocks.map((block) =>
        block.id === blockId && block.type === "image"
          ? updater(block)
          : block
      )
    );
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    let focusTargetId: string | null = null;

    setBlocks((currentBlocks) => {
      const index = currentBlocks.findIndex((block) => block.id === blockId);
      if (index === -1) return currentBlocks;

      const nextBlocks = ensureEditorBlocks(
        currentBlocks.filter((block) => block.id !== blockId)
      );

      for (let i = Math.max(0, index - 1); i < nextBlocks.length; i++) {
        if (nextBlocks[i].type === "text") {
          focusTargetId = nextBlocks[i].id;
          break;
        }
      }

      if (!focusTargetId) {
        focusTargetId = nextBlocks.find((block) => block.type === "text")?.id ?? null;
      }

      return nextBlocks;
    });

    if (focusTargetId) {
      focusTextBlock(focusTargetId);
    }
  }, [focusTextBlock]);

  const maybeFinishStream = useCallback(() => {
    if (
      streamCompletedRef.current &&
      !isPlayingRef.current &&
      audioQueueRef.current.length === 0
    ) {
      setMode("none");
      setActiveBlockId(null);
      setActiveSpeechLabel(null);
    }
  }, []);

  // Play audio queue
  const playAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    const ctx = getAudioContext();

    try {
      while (audioQueueRef.current.length > 0 && !stopRequestedRef.current) {
        const item = audioQueueRef.current.shift()!;
        setActiveBlockId(item.blockId);
        setActiveSpeechLabel(item.label);
        const buffer = item.buffer;
        const source = ctx.createBufferSource();
        currentSourceRef.current = source;
        source.buffer = buffer;
        source.connect(ctx.destination);

        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        await new Promise<void>((resolve) => {
          source.onended = () => {
            currentSourceRef.current = null;
            resolve();
          };
          source.start();
        });
      }
    } catch (error) {
      console.error("Audio playback error:", error);
    } finally {
      isPlayingRef.current = false;
      maybeFinishStream();
    }
  }, [getAudioContext, maybeFinishStream]);

  // Queue audio for playback
  const queueAudio = useCallback(async (audioData: Float32Array, blockId: string, label: string) => {
    const ctx = getAudioContext();
    const audioBuffer = ctx.createBuffer(1, audioData.length, SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(audioData);
    audioQueueRef.current.push({ buffer: audioBuffer, blockId, label });
    playAudioQueue();
  }, [getAudioContext, playAudioQueue]);

  const interruptPlayback = useCallback(() => {
    stopRequestedRef.current = true;
    streamCompletedRef.current = false;

    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
      }
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const runOCR = useCallback(async (blockId: string, imageDataUrl: string) => {
    updateImageBlock(blockId, (block) => ({
      ...block,
      ocrStatus: "processing",
      ocrError: undefined,
    }));

    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "OCR failed");
      }

      updateImageBlock(blockId, (block) => ({
        ...block,
        ocrText: block.hasManualText && block.ocrText.trim() ? block.ocrText : String(data?.text ?? ""),
        ocrStatus: "done",
        ocrError: undefined,
      }));
    } catch (error) {
      updateImageBlock(blockId, (block) => ({
        ...block,
        ocrStatus: "error",
        ocrError: error instanceof Error ? error.message : "OCR failed",
      }));
    }
  }, [updateImageBlock]);

  const insertImagesAfterBlock = useCallback(async (afterBlockId: string | null, files: File[]) => {
    const imageBlocks = await Promise.all(
      files.map(async (file) => createImageBlock(
        await readFileAsDataUrl(file),
        file.name || "Pasted image",
        file.type || "image/png"
      ))
    );

    const trailingTextBlock = createEmptyTextBlock();
    let focusTargetId = trailingTextBlock.id;

    setBlocks((currentBlocks) => {
      const currentIndex = afterBlockId
        ? currentBlocks.findIndex((block) => block.id === afterBlockId)
        : currentBlocks.length - 1;
      const insertIndex = currentIndex >= 0 ? currentIndex + 1 : currentBlocks.length;
      const nextBlock = currentBlocks[insertIndex];
      const shouldAddTrailingText = !nextBlock || nextBlock.type !== "text";

      if (!shouldAddTrailingText && nextBlock.type === "text") {
        focusTargetId = nextBlock.id;
      }

      return [
        ...currentBlocks.slice(0, insertIndex),
        ...imageBlocks,
        ...(shouldAddTrailingText ? [trailingTextBlock] : []),
        ...currentBlocks.slice(insertIndex),
      ];
    });

    focusTextBlock(focusTargetId, "start");
    imageBlocks.forEach((block) => {
      if (block.imageDataUrl) {
        void runOCR(block.id, block.imageDataUrl);
      }
    });
  }, [focusTextBlock, runOCR]);

  const stopPlaybackInternal = useCallback(() => {
    stopRequestedRef.current = true;
    streamCompletedRef.current = true;

    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
      }
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setMode("none");
    setProgress(100);
    setProgressText("Stopped");
    setActiveBlockId(null);
    setActiveSpeechLabel(null);
    requestSpeechPlanRef.current = [];
  }, []);

  // Stop playback
  const stopPlayback = useCallback(() => {
    stopPlaybackInternal();
  }, [stopPlaybackInternal]);

  const startStreamingFromBlock = useCallback(async (startBlockId: string | null) => {
    const startIndex = startBlockId
      ? blocks.findIndex((block) => block.id === startBlockId)
      : 0;
    const requestBlocks = startIndex >= 0 ? blocks.slice(startIndex) : blocks;
    const requestPlan = buildSpeechPlan(toTTSRequestBlocks(requestBlocks), 300);

    if (requestPlan.length === 0) {
      setProgressText("Add text or OCR text before streaming");
      return;
    }

    interruptPlayback();
    requestSpeechPlanRef.current = requestPlan;
    const sessionId = ++streamSessionIdRef.current;

    setMode("stream");
    setProgress(0);
    setProgressText(`Starting ${requestPlan[0].label}...`);
    setActiveBlockId(requestPlan[0].blockId);
    setActiveSpeechLabel(requestPlan[0].label);
    audioQueueRef.current = [];
    stopRequestedRef.current = false;
    streamCompletedRef.current = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: toTTSRequestBlocks(requestBlocks), voice: selectedVoice, speed }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Streaming failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let totalChunksForRequest = 0;

      while (true) {
        if (sessionId !== streamSessionIdRef.current) {
          try {
            await reader.cancel();
          } catch {
          }
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          if (sessionId !== streamSessionIdRef.current) break;

          const data = JSON.parse(line.slice(6));
          if (data.type === "start") {
            totalChunksForRequest = data.totalChunks ?? 0;
            setProgressText(`Processing ${totalChunksForRequest} blocks...`);
          } else if (data.type === "audio") {
            const audioData = decodeAudioChunk(data.audio);
            const speechItem = requestSpeechPlanRef.current[data.chunkIndex];
            const blockId = data.blockId ?? speechItem?.blockId ?? requestSpeechPlanRef.current[0]?.blockId;
            const label = data.label ?? speechItem?.label ?? `Block ${data.chunkIndex + 1}`;

            await queueAudio(audioData, blockId, label);

            if (totalChunksForRequest > 0) {
              const percent = ((data.chunkIndex + 1) / totalChunksForRequest) * 100;
              setProgress(percent);
            }

            setProgressText(
              `Playing ${label} (${data.chunkIndex + 1}/${totalChunksForRequest || requestSpeechPlanRef.current.length})`
            );
          } else if (data.type === "complete") {
            setProgress(100);
            setProgressText("Streaming complete");
            streamCompletedRef.current = true;
            maybeFinishStream();
          } else if (data.type === "error") {
            setProgressText(`Error: ${data.error}`);
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError" && sessionId === streamSessionIdRef.current) {
        console.error("Stream error:", error);
        setProgressText("Stream error");
      }
    } finally {
      if (sessionId === streamSessionIdRef.current) {
        streamCompletedRef.current = true;
        maybeFinishStream();
      }
    }
  }, [blocks, interruptPlayback, maybeFinishStream, queueAudio, selectedVoice, speed]);

  // Handle stream button click
  const handleStream = async () => {
    if (mode === "stream") {
      stopPlayback();
      return;
    }

    await startStreamingFromBlock(blocks[0]?.id ?? null);
  };

  const handleEditorPaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    if (mode !== "none") return;

    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);

    if (imageFiles.length === 0) return;

    event.preventDefault();
    void insertImagesAfterBlock(focusedBlockIdRef.current, imageFiles);
  }, [insertImagesAfterBlock, mode]);

  const handleTextBlockInput = useCallback((event: FormEvent<HTMLTextAreaElement>) => {
    setTextareaHeight(event.currentTarget);
  }, []);

  const handleTextBlockKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>, blockId: string) => {
    if (mode !== "none") {
      event.preventDefault();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      const element = event.currentTarget;
      const selectionStart = element.selectionStart ?? element.value.length;
      const selectionEnd = element.selectionEnd ?? selectionStart;
      const currentBlock = blocks.find((block) => block.id === blockId);
      if (!currentBlock || currentBlock.type !== "text") return;

      const before = currentBlock.text.slice(0, selectionStart);
      const after = currentBlock.text.slice(selectionEnd);
      const nextBlock = createEmptyTextBlock(after);

      setBlocks((currentBlocks) =>
        currentBlocks.flatMap((block) => {
          if (block.id !== blockId || block.type !== "text") {
            return [block];
          }

          return [
            { ...block, text: before },
            nextBlock,
          ];
        })
      );

      focusTextBlock(nextBlock.id, "start");
      return;
    }

    if (event.key === "Backspace") {
      const currentBlock = blocks.find((block) => block.id === blockId);
      if (!currentBlock || currentBlock.type !== "text" || currentBlock.text.length > 0) {
        return;
      }

      event.preventDefault();
      removeBlock(blockId);
    }
  }, [blocks, focusTextBlock, mode, removeBlock]);

  // Handle download button click
  const handleDownload = async () => {
    if (mode === "download") {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setMode("none");
      setProgressText("Download cancelled");
      return;
    }

    const speechPlan = buildSpeechPlan(toTTSRequestBlocks(blocks), 300);
    if (speechPlan.length === 0) {
      setProgressText("Add text or OCR text before downloading");
      return;
    }

    setMode("download");
    setProgress(0);
    setProgressText("Generating audio file...");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/tts/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: toTTSRequestBlocks(blocks), voice: selectedVoice, speed }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "tts-output.wav";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);
      setProgressText("Download complete!");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Download error:", error);
        setProgressText("Download failed");
      }
    } finally {
      setMode("none");
    }
  };

  const isModelReadyFlag = !!status?.ready;
  const disableActions = isLoading || !isModelReadyFlag;

  const voices = status?.voices || {};
  const voiceEntries = Object.entries(voices);
  const selectedVoiceInfo = voices[selectedVoice];

  const speechPlan = buildSpeechPlan(toTTSRequestBlocks(blocks), 300);
  const wordCount = speechPlan.reduce((count, item) => {
    const words = item.text.trim() ? item.text.trim().split(/\s+/).length : 0;
    return count + words;
  }, 0);
  const charCount = speechPlan.reduce((count, item) => count + item.text.length, 0);
  const imageCount = blocks.filter((block) => block.type === "image").length;
  const pendingImageCount = blocks.filter(
    (block) => block.type === "image" && block.ocrStatus === "processing"
  ).length;

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full">
      {/* Left Panel - Controls */}
      <div className="lg:w-80 xl:w-96 flex-shrink-0 flex flex-col gap-5">
        {/* Status Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-accent p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <WaveformIcon size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Kokoro TTS</h2>
                <p className="text-white/80 text-sm">Server-side synthesis</p>
              </div>
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2">
              {isLoading ? (
                <>
                  <LoadingIcon size={16} className="text-primary" />
                  <span className="text-sm text-gray-600">{progressText}</span>
                </>
              ) : (
                <>
                  <CheckIcon size={16} className="text-success" />
                  <span className="text-sm text-success font-medium">Model Ready</span>
                </>
              )}
            </div>
            {(isLoading || mode !== "none") && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{progressText}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${progress >= 100 ? "bg-success" : "bg-gradient-to-r from-primary to-accent"
                      }`}
                    style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Voice Selection Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserIcon size={18} className="text-primary" />
            <h3 className="font-semibold text-gray-800">Voice</h3>
          </div>
          <select
            id="voice-select"
            aria-label="Select voice"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            disabled={mode !== "none" || voiceEntries.length === 0}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white
              disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {voiceEntries.length === 0 ? (
              <option>Loading voices...</option>
            ) : (
              voiceEntries.map(([id, voice]) => (
                <option key={id} value={id}>
                  {voice.traits ? `${voice.traits} ` : ""}{voice.name} ({voice.language})
                </option>
              ))
            )}
          </select>
          {selectedVoiceInfo && (
            <div className="mt-3 flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selectedVoiceInfo.gender === "Female"
                ? "bg-pink-100 text-pink-700"
                : "bg-blue-100 text-blue-700"
                }`}>
                {selectedVoiceInfo.gender}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {selectedVoiceInfo.language}
              </span>
            </div>
          )}
        </div>

        {/* Speed Control Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <SpeedIcon size={18} className="text-primary" />
              <h3 className="font-semibold text-gray-800">Speed</h3>
            </div>
            <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded-lg text-gray-700">
              {speed.toFixed(1)}x
            </span>
          </div>
          <input
            id="speed-slider"
            aria-label="Playback speed"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            disabled={mode !== "none"}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
              accent-primary disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>0.5x</span>
            <span>1.0x</span>
            <span>2.0x</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleStream}
            disabled={disableActions}
            className={`w-full flex items-center justify-center gap-3 px-5 py-4 rounded-xl font-semibold text-white shadow-lg transition-all
              ${mode === "stream"
                ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                : "bg-gradient-to-r from-primary to-accent hover:shadow-xl hover:scale-[1.02]"
              }
              disabled:from-gray-300 disabled:to-gray-400 disabled:shadow-none disabled:scale-100`}
          >
            {mode === "stream" ? (
              <>
                <StopIcon size={20} />
                <span>Stop Streaming</span>
              </>
            ) : isLoading ? (
              <>
                <LoadingIcon size={20} />
                <span>Loading Model...</span>
              </>
            ) : (
              <>
                <SpeakerIcon size={20} />
                <span>Stream Blocks</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            disabled={disableActions || mode === "stream"}
            className={`w-full flex items-center justify-center gap-3 px-5 py-4 rounded-xl font-semibold shadow-lg transition-all
              ${mode === "download"
                ? "bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700"
                : "bg-white text-gray-700 border-2 border-gray-200 hover:border-primary hover:text-primary hover:shadow-xl"
              }
              disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none`}
          >
            {mode === "download" ? (
              <>
                <LoadingIcon size={20} />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <DownloadIcon size={20} />
                <span>Download Audio</span>
              </>
            )}
          </button>
        </div>

        {/* Tips Card */}
        <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl border border-primary/10 p-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            <strong className="text-primary">Tip:</strong> Press Enter to create a new text block, Shift+Enter for a line break, and paste screenshots directly into the editor.
          </p>
        </div>
      </div>

      {/* Right Panel - Text Editor */}
      <div className="flex-1 flex flex-col min-h-0">
        <div
          className="bg-white rounded-2xl shadow-lg border border-gray-100 flex-1 flex flex-col overflow-hidden"
          onPasteCapture={handleEditorPaste}
        >
          {/* Editor Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <TextIcon size={18} className="text-gray-400" />
              <span className="font-medium text-gray-700">Document Blocks</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>{blocks.length} blocks</span>
              <span>{imageCount} images</span>
              <span>{wordCount} words</span>
              <span>{charCount} characters</span>
              {activeSpeechLabel && mode === "stream" && (
                <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">
                  {activeSpeechLabel}
                </span>
              )}
            </div>
          </div>

          {/* Textarea */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {blocks.map((block, index) => {
              const isActive = mode === "stream" && activeBlockId === block.id;

              if (block.type === "text") {
                return (
                  <div
                    key={block.id}
                    className={`group rounded-2xl border transition-all ${isActive
                      ? "border-primary/40 bg-primary/5 shadow-md"
                      : "border-transparent bg-white hover:border-gray-200 hover:bg-gray-50/60"
                      }`}
                    onClick={() => {
                      if (mode === "stream") {
                        void startStreamingFromBlock(block.id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        T
                      </div>
                      <div className="flex-1 min-w-0">
                        <textarea
                          ref={(element) => {
                            textareaRefs.current[block.id] = element;
                            if (element) {
                              setTextareaHeight(element);
                            }
                          }}
                          value={block.text}
                          onChange={(event) => updateTextBlock(block.id, event.target.value)}
                          onInput={handleTextBlockInput}
                          onKeyDown={(event) => handleTextBlockKeyDown(event, block.id)}
                          onFocus={() => {
                            focusedBlockIdRef.current = block.id;
                          }}
                          placeholder={index === 0
                            ? "Type your script here, or paste an image from the clipboard..."
                            : "Type something..."}
                          className="w-full resize-none overflow-hidden border-0 bg-transparent px-0 py-1 text-base leading-relaxed text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-0"
                          disabled={mode === "download"}
                          readOnly={mode === "stream"}
                          rows={1}
                        />
                      </div>
                      {mode === "none" && blocks.length > 1 && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeBlock(block.id);
                          }}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={block.id}
                  className={`rounded-2xl border transition-all ${isActive
                    ? "border-primary/40 bg-primary/5 shadow-md"
                    : "border-gray-100 bg-white"
                    }`}
                  onClick={() => {
                    if (mode === "stream") {
                      void startStreamingFromBlock(block.id);
                    }
                  }}
                >
                  <div className="flex flex-col gap-4 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                          <ImageIcon size={16} />
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">Image block</div>
                          <div className="text-xs text-gray-400">
                            {block.fileName || `Pasted image ${index + 1}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${block.ocrStatus === "processing"
                          ? "bg-amber-100 text-amber-700"
                          : block.ocrStatus === "error"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                          }`}>
                          {block.ocrStatus === "processing"
                            ? "Running OCR"
                            : block.ocrStatus === "error"
                              ? "OCR error"
                              : block.ocrText.trim()
                                ? "OCR ready"
                                : "No OCR text"}
                        </span>
                        {mode === "none" && (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (block.imageDataUrl) {
                                  void runOCR(block.id, block.imageDataUrl);
                                }
                              }}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                            >
                              Retry OCR
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeBlock(block.id);
                              }}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {block.imageDataUrl && (
                      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                        <img
                          src={block.imageDataUrl}
                          alt={block.fileName || "Pasted image"}
                          className="max-h-[420px] w-full object-contain"
                        />
                      </div>
                    )}

                    <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-gray-700">Text to speak</div>
                        {block.ocrStatus === "processing" && (
                          <div className="flex items-center gap-2 text-xs text-amber-700">
                            <LoadingIcon size={14} className="text-amber-500" />
                            <span>Extracting text from image...</span>
                          </div>
                        )}
                      </div>
                      <textarea
                        value={block.ocrText}
                        onChange={(event) => {
                          updateImageBlock(block.id, (currentBlock) => ({
                            ...currentBlock,
                            ocrText: event.target.value,
                            hasManualText: true,
                            ocrError: undefined,
                          }));
                        }}
                        onInput={handleTextBlockInput}
                        onFocus={() => {
                          focusedBlockIdRef.current = block.id;
                        }}
                        placeholder="OCR text will appear here. You can also type or correct it manually."
                        className="w-full resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-sm leading-relaxed text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-0"
                        disabled={mode === "download"}
                        readOnly={mode === "stream"}
                        rows={2}
                      />
                      {block.ocrStatus === "error" && block.ocrError && (
                        <p className="mt-2 text-xs text-red-600">{block.ocrError}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {pendingImageCount > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                OCR is still running for {pendingImageCount} image{pendingImageCount === 1 ? "" : "s"}.
              </div>
            )}
          </div>

          {/* Editor Footer */}
          {mode === "stream" && (
            <div className="px-5 py-3 border-t border-gray-100 bg-gradient-to-r from-primary/5 to-accent/5">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-sm text-gray-600">Streaming block audio... click a block to jump.</span>
                </div>
                <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
