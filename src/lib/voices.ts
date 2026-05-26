export interface VoiceInfo {
  name: string;
  language: string;
  gender: "Male" | "Female";
  traits?: string;
  targetQuality?: string;
  overallGrade?: string;
}

export const VOICES: Record<string, VoiceInfo> = Object.freeze({
  af_heart: {
    name: "Heart",
    language: "en-us",
    gender: "Female",
    traits: "❤️",
    targetQuality: "A",
    overallGrade: "A",
  },
  af_alloy: {
    name: "Alloy",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C",
  },
  af_aoede: {
    name: "Aoede",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C+",
  },
  af_bella: {
    name: "Bella",
    language: "en-us",
    gender: "Female",
    traits: "🔥",
    targetQuality: "A",
    overallGrade: "A-",
  },
  af_jessica: {
    name: "Jessica",
    language: "en-us",
    gender: "Female",
    targetQuality: "C",
    overallGrade: "D",
  },
  af_kore: {
    name: "Kore",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C+",
  },
  af_nicole: {
    name: "Nicole",
    language: "en-us",
    gender: "Female",
    traits: "🎧",
    targetQuality: "B",
    overallGrade: "C",
  },
  af_nova: {
    name: "Nova",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "B-",
  },
  af_river: {
    name: "River",
    language: "en-us",
    gender: "Female",
    traits: "🏞️",
    targetQuality: "B",
    overallGrade: "C-",
  },
  af_sarah: {
    name: "Sarah",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C+",
  },
  af_sky: {
    name: "Sky",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C",
  },
  am_adam: {
    name: "Adam",
    language: "en-us",
    gender: "Male",
    targetQuality: "D",
    overallGrade: "D",
  },
  am_echo: {
    name: "Echo",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D+",
  },
  am_eric: {
    name: "Eric",
    language: "en-us",
    gender: "Male",
    traits: "⭐",
    targetQuality: "B",
    overallGrade: "B-",
  },
  am_fenrir: {
    name: "Fenrir",
    language: "en-us",
    gender: "Male",
    traits: "🐺",
    targetQuality: "B",
    overallGrade: "B-",
  },
  am_liam: {
    name: "Liam",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D+",
  },
  am_michael: {
    name: "Michael",
    language: "en-us",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C",
  },
  am_onyx: {
    name: "Onyx",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D",
  },
  am_puck: {
    name: "Puck",
    language: "en-us",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C+",
  },
  am_santa: {
    name: "Santa",
    language: "en-us",
    gender: "Male",
    traits: "🎅",
    targetQuality: "C",
    overallGrade: "D",
  },
  bf_emma: {
    name: "Emma",
    language: "en-gb",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C+",
  },
  bf_isabella: {
    name: "Isabella",
    language: "en-gb",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C",
  },
  bm_george: {
    name: "George",
    language: "en-gb",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C-",
  },
  bm_lewis: {
    name: "Lewis",
    language: "en-gb",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D",
  },
  bm_fable: {
    name: "Fable",
    language: "en-gb",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C-",
  },
});

// Voice data cache
const voiceDataCache: Map<string, Float32Array> = new Map();

export async function getVoiceData(voice: string): Promise<Float32Array> {
  if (voiceDataCache.has(voice)) {
    return voiceDataCache.get(voice)!;
  }

  const url = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${voice}.bin?download=true`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch voice data for ${voice}: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const voiceData = new Float32Array(arrayBuffer);
  
  voiceDataCache.set(voice, voiceData);
  return voiceData;
}
