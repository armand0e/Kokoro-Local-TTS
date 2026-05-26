import { splitTextSmart } from "./text-splitter";

export type OCRStatus = "idle" | "processing" | "done" | "error";

export interface TextBlock {
  id: string;
  type: "text";
  text: string;
}

export interface ImageBlock {
  id: string;
  type: "image";
  imageDataUrl?: string;
  fileName?: string;
  mimeType?: string;
  ocrText: string;
  ocrStatus?: OCRStatus;
  ocrError?: string;
  hasManualText?: boolean;
}

export type EditorBlock = TextBlock | ImageBlock;

export type TTSRequestBlock =
  | TextBlock
  | Pick<ImageBlock, "id" | "type" | "ocrText">;

export interface SpeechPlanItem {
  id: string;
  blockId: string;
  blockIndex: number;
  blockType: "text" | "image";
  chunkIndex: number;
  label: string;
  text: string;
  source: "text" | "ocr";
}

export function createBlockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `block-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyTextBlock(text: string = ""): TextBlock {
  return {
    id: createBlockId(),
    type: "text",
    text,
  };
}

export function createImageBlock(
  imageDataUrl: string,
  fileName: string = "Pasted image",
  mimeType: string = "image/png"
): ImageBlock {
  return {
    id: createBlockId(),
    type: "image",
    imageDataUrl,
    fileName,
    mimeType,
    ocrText: "",
    ocrStatus: "idle",
    ocrError: undefined,
    hasManualText: false,
  };
}

export function ensureEditorBlocks(blocks: EditorBlock[]): EditorBlock[] {
  if (blocks.length === 0) {
    return [createEmptyTextBlock()];
  }

  if (blocks.some((block) => block.type === "text")) {
    return blocks;
  }

  return [...blocks, createEmptyTextBlock()];
}

export function toTTSRequestBlocks(blocks: EditorBlock[]): TTSRequestBlock[] {
  return blocks.map((block) =>
    block.type === "text"
      ? { id: block.id, type: "text", text: block.text }
      : { id: block.id, type: "image", ocrText: block.ocrText }
  );
}

export function buildSpeechPlan(
  blocks: ReadonlyArray<{
    id: string;
    type: "text" | "image";
    text?: string;
    ocrText?: string;
  }>,
  maxChunkLength: number = 300
): SpeechPlanItem[] {
  const plan: SpeechPlanItem[] = [];
  let textBlockCount = 0;
  let imageBlockCount = 0;

  blocks.forEach((block, blockIndex) => {
    if (block.type === "text") {
      const value = (block.text ?? "").trim();
      if (!value) return;

      textBlockCount += 1;
      const chunks = splitTextSmart(value, maxChunkLength);
      chunks.forEach((chunk, chunkIndex) => {
        plan.push({
          id: `${block.id}:${chunkIndex}`,
          blockId: block.id,
          blockIndex,
          blockType: "text",
          chunkIndex,
          label: `Text block ${textBlockCount}`,
          text: chunk,
          source: "text",
        });
      });
      return;
    }

    imageBlockCount += 1;
    const value = (block.ocrText ?? "").trim();
    if (!value) return;

    const chunks = splitTextSmart(value, maxChunkLength);
    chunks.forEach((chunk, chunkIndex) => {
      plan.push({
        id: `${block.id}:${chunkIndex}`,
        blockId: block.id,
        blockIndex,
        blockType: "image",
        chunkIndex,
        label: `Image ${imageBlockCount} OCR`,
        text: chunk,
        source: "ocr",
      });
    });
  });

  return plan;
}

export function buildSpeechPlanFromText(text: string, maxChunkLength: number = 300): SpeechPlanItem[] {
  return buildSpeechPlan(
    [
      {
        id: "legacy-text-input",
        type: "text",
        text,
      },
    ],
    maxChunkLength
  );
}
