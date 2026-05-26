import { pipeline, type ImageToTextPipeline } from "@huggingface/transformers";

const OCR_MODEL_ID = "Xenova/trocr-small-printed";

type OCRPipeline = ImageToTextPipeline;

type OCRState = {
  instance: OCRPipeline | null;
  loadingPromise: Promise<OCRPipeline> | null;
  progress: number;
  lastStatus: string;
};

const getGlobalState = (): OCRState => {
  const globalState = globalThis as unknown as { __kokoroOcrState?: OCRState };

  if (!globalState.__kokoroOcrState) {
    globalState.__kokoroOcrState = {
      instance: null,
      loadingPromise: null,
      progress: 0,
      lastStatus: "",
    };
  }

  return globalState.__kokoroOcrState;
};

async function loadOCRPipeline(): Promise<OCRPipeline> {
  const state = getGlobalState();

  return pipeline<OCRPipeline>("image-to-text", OCR_MODEL_ID, {
    device: "cpu",
    dtype: "q8",
    progress_callback: (progress: { progress?: number; status?: string }) => {
      if (typeof progress.progress === "number") {
        state.progress = Math.max(0, Math.min(100, Math.round(progress.progress)));
      }

      if (progress.status) {
        state.lastStatus = progress.status;
      }
    },
  });
}

async function getOCRPipeline(): Promise<OCRPipeline> {
  const state = getGlobalState();

  if (state.instance) {
    return state.instance;
  }

  if (state.loadingPromise) {
    return state.loadingPromise;
  }

  state.loadingPromise = loadOCRPipeline();

  try {
    state.instance = await state.loadingPromise;
    return state.instance;
  } finally {
    state.loadingPromise = null;
  }
}

function imageDataUrlToBlob(imageDataUrl: string): Blob {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);

  if (!match) {
    throw new Error("Invalid image data");
  }

  const [, mimeType, base64] = match;
  const bytes = Buffer.from(base64, "base64");

  return new Blob([bytes], { type: mimeType });
}

function normalizeOCRText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function extractTextFromImage(imageDataUrl: string): Promise<string> {
  const ocr = await getOCRPipeline();
  const output = await ocr(imageDataUrlToBlob(imageDataUrl), {
    max_new_tokens: 256,
  });

  const items = Array.isArray(output) ? output : [output];

  return items
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .map((item) => normalizeOCRText(String(item.generated_text ?? "")))
    .filter(Boolean)
    .join("\n");
}
