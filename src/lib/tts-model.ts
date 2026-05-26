import { StyleTextToSpeech2Model, AutoTokenizer, Tensor } from "@huggingface/transformers";
import { VOICES, getVoiceData } from "./voices";
import { phonemize } from "./phonemize";

const STYLE_DIM = 256;
const SAMPLE_RATE = 24000;
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

interface TTSModel {
  model: StyleTextToSpeech2Model;
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
}

type TTSGlobalState = {
  instance: TTSModel | null;
  loadingPromise: Promise<TTSModel> | null;
  isLoading: boolean;
  progress: number;
  lastProgressText: string;
};

const getGlobalState = (): TTSGlobalState => {
  const g = globalThis as unknown as { __kokoroTtsState?: TTSGlobalState };
  if (!g.__kokoroTtsState) {
    g.__kokoroTtsState = {
      instance: null,
      loadingPromise: null,
      isLoading: false,
      progress: 0,
      lastProgressText: "",
    };
  }
  return g.__kokoroTtsState;
};

async function loadModel(): Promise<TTSModel> {
  console.log(`[TTS] Loading model from ${MODEL_ID}...`);

  const device = "cpu";
  const dtype = "fp32";

  console.log(`[TTS] Using device: ${device}, dtype: ${dtype}`);

  const state = getGlobalState();

  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: (progress: { progress?: number; status?: string; file?: string }) => {
        if (progress.progress !== undefined) {
          const pct = Math.max(0, Math.min(100, Math.round(progress.progress)));
          state.progress = pct;
          state.lastProgressText = progress.status ?? "";
          console.log(`[TTS] Loading: ${pct}%`);
        }
      },
    }),
    AutoTokenizer.from_pretrained(MODEL_ID),
  ]);

  console.log("[TTS] Model and tokenizer loaded");
  state.progress = 100;
  return { model, tokenizer };
}

async function getModelInstance(): Promise<TTSModel> {
  const state = getGlobalState();

  if (state.instance) {
    return state.instance;
  }

  if (state.loadingPromise) {
    return state.loadingPromise;
  }

  state.isLoading = true;
  state.progress = Math.max(state.progress, 0);
  console.log("[TTS] Starting model load...");

  state.loadingPromise = loadModel();

  try {
    state.instance = await state.loadingPromise;
    state.isLoading = false;
    console.log("[TTS] Model loaded successfully!");
    return state.instance;
  } catch (error) {
    state.loadingPromise = null;
    state.isLoading = false;
    throw error;
  }
}

export interface GenerateAudioResult {
  audio: Float32Array;
  sampleRate: number;
}

export async function generateAudio(
  text: string,
  voice: string = "af_heart",
  speed: number = 1
): Promise<GenerateAudioResult> {
  const { model, tokenizer } = await getModelInstance();

  if (!VOICES.hasOwnProperty(voice)) {
    throw new Error(`Voice "${voice}" not found. Available: ${Object.keys(VOICES).join(", ")}`);
  }

  const language = voice.at(0) ?? "a";
  const phonemes = await phonemize(text, language);

  // Tokenize the phonemes
  const { input_ids } = tokenizer(phonemes, { truncation: true });

  // Calculate number of tokens for voice style selection
  const numTokens = Math.max((input_ids.dims?.at(-1) ?? 0) - 2, 0);

  // Load voice style data
  const voiceData = await getVoiceData(voice);
  const offset = numTokens * STYLE_DIM;
  const styleData = voiceData.slice(offset, offset + STYLE_DIM);

  // Prepare model inputs
  const inputs = {
    input_ids,
    style: new Tensor("float32", styleData, [1, STYLE_DIM]),
    speed: new Tensor("float32", [speed], [1]),
  };

  // Generate audio
  const { waveform } = await model(inputs);

  return {
    audio: waveform.data as Float32Array,
    sampleRate: SAMPLE_RATE,
  };
}

export function getAvailableVoices() {
  return VOICES;
}

export function isModelReady(): boolean {
  return getGlobalState().instance !== null;
}

export function isModelLoading(): boolean {
  const state = getGlobalState();
  return state.isLoading && state.instance === null;
}

export function getModelLoadProgress(): number {
  return getGlobalState().progress;
}

export function getModelLoadStatusText(): string {
  return getGlobalState().lastProgressText;
}

// Pre-load the model on import (server startup)
export async function preloadModel(): Promise<void> {
  try {
    await getModelInstance();
  } catch (error) {
    console.error("[TTS] Failed to preload model:", error);
  }
}

export { SAMPLE_RATE };
