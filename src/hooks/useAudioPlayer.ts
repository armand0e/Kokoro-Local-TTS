"use client";

import { useRef, useCallback, useState } from "react";

const SAMPLE_RATE = 24000;

export interface AudioQueueItem {
  buffer: AudioBuffer;
  blockId: string;
  label: string;
}

export function useAudioPlayer() {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeSpeechLabel, setActiveSpeechLabel] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioQueueItem[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const stopRequestedRef = useRef(false);
  const streamCompletedRef = useRef(false);
  const onFinishRef = useRef<(() => void) | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    return audioContextRef.current;
  }, []);

  const maybeFinishStream = useCallback(() => {
    if (
      streamCompletedRef.current &&
      !isPlayingRef.current &&
      audioQueueRef.current.length === 0
    ) {
      setActiveBlockId(null);
      setActiveSpeechLabel(null);
      onFinishRef.current?.();
    }
  }, []);

  const playAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    const ctx = getAudioContext();

    try {
      while (audioQueueRef.current.length > 0 && !stopRequestedRef.current) {
        const item = audioQueueRef.current.shift()!;
        setActiveBlockId(item.blockId);
        setActiveSpeechLabel(item.label);

        const source = ctx.createBufferSource();
        currentSourceRef.current = source;
        source.buffer = item.buffer;
        source.connect(ctx.destination);

        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
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

  const queueAudio = useCallback(
    async (audioData: Float32Array, blockId: string, label: string) => {
      const ctx = getAudioContext();
      const audioBuffer = ctx.createBuffer(1, audioData.length, SAMPLE_RATE);
      audioBuffer.getChannelData(0).set(audioData);
      audioQueueRef.current.push({ buffer: audioBuffer, blockId, label });
      playAudioQueue();
    },
    [getAudioContext, playAudioQueue]
  );

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    streamCompletedRef.current = true;

    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // ignore
      }
      currentSourceRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setActiveBlockId(null);
    setActiveSpeechLabel(null);
  }, []);

  const reset = useCallback(() => {
    stopRequestedRef.current = false;
    streamCompletedRef.current = false;
    audioQueueRef.current = [];
  }, []);

  const markStreamComplete = useCallback(() => {
    streamCompletedRef.current = true;
    maybeFinishStream();
  }, [maybeFinishStream]);

  const setOnFinish = useCallback((cb: (() => void) | null) => {
    onFinishRef.current = cb;
  }, []);

  return {
    activeBlockId,
    activeSpeechLabel,
    queueAudio,
    stop,
    reset,
    markStreamComplete,
    setOnFinish,
    isPlayingRef,
    stopRequestedRef,
  };
}
