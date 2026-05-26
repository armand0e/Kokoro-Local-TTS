"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Toolbar } from "./layout/Toolbar";
import { SettingsPopout } from "./panels/SettingsPopout";
import { SidePanel, type SidePanelData } from "./panels/SidePanel";
import { NotionEditor, type NotionEditorHandle } from "./editor/NotionEditor";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { ImageBlockCard } from "./editor/ImageBlockCard";
import { Loader2 } from "lucide-react";

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

interface ImageEntry {
  id: string;
  dataUrl: string;
  fileName: string;
  markdown: string;
  ttsDescription: string;
  extractionStatus: "idle" | "processing" | "done" | "error";
  error?: string;
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
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read"));
    reader.readAsDataURL(file);
  });
}

function generateId(): string {
  return crypto.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 10)}`;
}

export function TTSApp() {
  // Model & status
  const [status, setStatus] = useState<TTSStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("Loading model...");

  // UI state
  const [mode, setMode] = useState<Mode>("none");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelData, setSidePanelData] = useState<SidePanelData | null>(null);

  // Settings
  const [selectedVoice, setSelectedVoice] = useState("af_heart");
  const [speed, setSpeed] = useState(1.0);

  // Content
  const [images, setImages] = useState<ImageEntry[]>([]);
  const editorRef = useRef<NotionEditorHandle>(null);

  // Audio
  const audio = useAudioPlayer();
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamSessionRef = useRef(0);

  // Poll model status
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
          data.loading ? `Loading model... ${Math.round(pct)}%` : "Starting model..."
        );
      } catch {
        if (cancelled) return;
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

  // Set audio finish callback
  useEffect(() => {
    audio.setOnFinish(() => {
      setMode("none");
      setProgress(100);
      setProgressText("Complete");
    });
  }, [audio]);

  // ─── Image handling ───

  const extractDocument = useCallback(async (imageId: string, dataUrl: string) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === imageId ? { ...img, extractionStatus: "processing" as const } : img
      )
    );

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Extraction failed");
      }

      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? {
                ...img,
                markdown: data.markdown || "",
                ttsDescription: data.ttsDescription || "",
                extractionStatus: "done" as const,
              }
            : img
        )
      );
    } catch (error) {
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? {
                ...img,
                extractionStatus: "error" as const,
                error: error instanceof Error ? error.message : "Failed",
              }
            : img
        )
      );
    }
  }, []);

  const handleImageAdd = useCallback(
    async (file: File) => {
      const dataUrl = await readFileAsDataUrl(file);
      const id = generateId();

      const entry: ImageEntry = {
        id,
        dataUrl,
        fileName: file.name || "Pasted image",
        markdown: "",
        ttsDescription: "",
        extractionStatus: "idle",
      };

      setImages((prev) => [...prev, entry]);

      // Insert image into editor
      editorRef.current?.insertImage(dataUrl, file.name);

      // Start extraction
      void extractDocument(id, dataUrl);
    },
    [extractDocument]
  );

  const handleImageClick = useCallback(
    (imageId: string) => {
      const img = images.find((i) => i.id === imageId);
      if (!img) return;

      setSidePanelData({
        imageUrl: img.dataUrl,
        fileName: img.fileName,
        markdown: img.markdown,
        ttsDescription: img.ttsDescription,
        extractionStatus: img.extractionStatus,
        error: img.error,
      });
      setSidePanelOpen(true);
    },
    [images]
  );

  const handleImageRemove = useCallback((imageId: string) => {
    setImages((prev) => prev.filter((img) => img.id !== imageId));
    // Close side panel if showing removed image
    if (sidePanelData?.imageUrl) {
      const removedImg = images.find((i) => i.id === imageId);
      if (removedImg && removedImg.dataUrl === sidePanelData.imageUrl) {
        setSidePanelOpen(false);
        setSidePanelData(null);
      }
    }
  }, [images, sidePanelData]);

  // Keep side panel in sync with image data (e.g., when extraction completes)
  useEffect(() => {
    if (!sidePanelOpen || !sidePanelData) return;
    const currentImg = images.find((img) => img.dataUrl === sidePanelData.imageUrl);
    if (!currentImg) return;
    // Only update if data actually changed
    if (
      currentImg.markdown !== sidePanelData.markdown ||
      currentImg.ttsDescription !== sidePanelData.ttsDescription ||
      currentImg.extractionStatus !== sidePanelData.extractionStatus
    ) {
      setSidePanelData({
        imageUrl: currentImg.dataUrl,
        fileName: currentImg.fileName,
        markdown: currentImg.markdown,
        ttsDescription: currentImg.ttsDescription,
        extractionStatus: currentImg.extractionStatus,
        error: currentImg.error,
      });
    }
  }, [images, sidePanelOpen, sidePanelData]);

  // ─── TTS actions ───

  const getFullText = useCallback((): string => {
    const editorText = editorRef.current?.getTextContent() ?? "";
    const imageTexts = images
      .filter((img) => img.ttsDescription)
      .map((img) => img.ttsDescription);
    return [editorText, ...imageTexts].filter(Boolean).join("\n\n");
  }, [images]);

  const handleStream = useCallback(async () => {
    const text = getFullText();
    if (!text.trim()) {
      setProgressText("Add some content first");
      return;
    }

    audio.stop();
    audio.reset();
    const sessionId = ++streamSessionRef.current;

    setMode("stream");
    setProgress(0);
    setProgressText("Starting...");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: selectedVoice, speed }),
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
      let totalChunks = 0;

      while (true) {
        if (sessionId !== streamSessionRef.current) {
          await reader.cancel().catch(() => {});
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          if (sessionId !== streamSessionRef.current) break;

          const data = JSON.parse(line.slice(6));

          if (data.type === "start") {
            totalChunks = data.totalChunks ?? 0;
            setProgressText(`Processing ${totalChunks} chunks...`);
          } else if (data.type === "audio") {
            const audioData = decodeAudioChunk(data.audio);
            const blockId = data.blockId ?? "main";
            const label = data.label ?? `Chunk ${data.chunkIndex + 1}`;

            await audio.queueAudio(audioData, blockId, label);

            if (totalChunks > 0) {
              setProgress(((data.chunkIndex + 1) / totalChunks) * 100);
            }
            setProgressText(`Playing ${label}`);
          } else if (data.type === "complete") {
            setProgress(100);
            setProgressText("Complete");
            audio.markStreamComplete();
          } else if (data.type === "error") {
            setProgressText(`Error: ${data.error}`);
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError" && sessionId === streamSessionRef.current) {
        setProgressText("Stream error");
        setMode("none");
      }
    } finally {
      if (sessionId === streamSessionRef.current) {
        audio.markStreamComplete();
      }
    }
  }, [audio, getFullText, selectedVoice, speed]);

  const handleStop = useCallback(() => {
    audio.stop();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMode("none");
    setProgress(100);
    setProgressText("Stopped");
  }, [audio]);

  const handleDownload = useCallback(async () => {
    if (mode === "download") {
      abortControllerRef.current?.abort();
      setMode("none");
      return;
    }

    const text = getFullText();
    if (!text.trim()) {
      setProgressText("Add some content first");
      return;
    }

    setMode("download");
    setProgress(0);
    setProgressText("Generating audio...");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/tts/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: selectedVoice, speed }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "kokoro-tts-output.wav";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);
      setProgressText("Download complete!");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setProgressText("Download failed");
      }
    } finally {
      setMode("none");
    }
  }, [getFullText, mode, selectedVoice, speed]);

  const handlePlayTTS = useCallback(
    async (text: string) => {
      if (!text.trim() || !status?.ready) return;
      // Quick preview: stream just this text
      audio.stop();
      audio.reset();

      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: selectedVoice, speed }),
        });

        if (!response.ok) return;
        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = JSON.parse(line.slice(6));
            if (data.type === "audio") {
              const audioData = decodeAudioChunk(data.audio);
              await audio.queueAudio(audioData, "preview", "Preview");
            }
          }
        }
        audio.markStreamComplete();
      } catch {
        // ignore preview errors
      }
    },
    [audio, selectedVoice, speed, status]
  );

  const isModelReady = !!status?.ready;
  const voices = status?.voices || {};

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      {/* Toolbar */}
      <div className="relative">
        <Toolbar
          isModelReady={isModelReady}
          isLoading={isLoading}
          mode={mode}
          progress={progress}
          progressText={progressText}
          onStream={mode === "stream" ? handleStop : handleStream}
          onStop={handleStop}
          onDownload={handleDownload}
          onSettingsToggle={() => setSettingsOpen((o) => !o)}
          settingsOpen={settingsOpen}
        />
        <SettingsPopout
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          voices={voices}
          selectedVoice={selectedVoice}
          onVoiceChange={setSelectedVoice}
          speed={speed}
          onSpeedChange={setSpeed}
          disabled={mode !== "none"}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Loading overlay */}
          {isLoading && (
            <div className="px-4 py-2 border-b border-border bg-surface-secondary flex items-center gap-2">
              <Loader2 size={14} className="text-accent animate-spin-slow" />
              <span className="text-xs text-text-secondary">{progressText}</span>
              <div className="flex-1 h-1 rounded-full bg-surface-tertiary overflow-hidden ml-2">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Editor */}
          <div className="flex-1 min-h-0">
            <NotionEditor
              ref={editorRef}
              placeholder="Start writing, or paste an image to extract text..."
              readOnly={mode === "stream"}
              onContentChange={() => {}}
              onImagePaste={handleImageAdd}
              onImageDrop={handleImageAdd}
            />
          </div>

          {/* Image cards row */}
          {images.length > 0 && (
            <div className="border-t border-border bg-surface-secondary px-4 py-3 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Images ({images.length})
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {images.map((img) => (
                  <ImageBlockCard
                    key={img.id}
                    image={img}
                    onClick={() => handleImageClick(img.id)}
                    onRemove={() => handleImageRemove(img.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <SidePanel
          open={sidePanelOpen}
          data={sidePanelData}
          onClose={() => setSidePanelOpen(false)}
          onPlayTTS={handlePlayTTS}
        />
      </div>
    </div>
  );
}
