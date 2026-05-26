import { NextResponse } from "next/server";
import { extractTextFromImage } from "@/lib/image-ocr";
import { parseModelOutput, plainTextToDocument } from "@/lib/document-extract";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/extract
 *
 * Extracts structured markdown from an image.
 * Currently uses TrOCR as a fallback; designed to be swapped for MinerU2.5-Pro.
 *
 * Body: { imageDataUrl: string, model?: "trocr" | "mineru" }
 * Response: { markdown: string, ttsDescription: string, elements: DetectedElement[] }
 */
export async function POST(request: Request) {
  try {
    const { imageDataUrl, model } = await request.json();

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return NextResponse.json(
        { error: "imageDataUrl is required" },
        { status: 400 }
      );
    }

    // Determine extraction method
    const extractionModel = model || "trocr";

    if (extractionModel === "mineru") {
      // TODO: Implement MinerU2.5-Pro extraction via Python subprocess
      // For now, fall through to TrOCR
      // When implemented:
      // const result = await extractWithMinerU(imageDataUrl);
      // return NextResponse.json(result);
    }

    // Default: Use TrOCR for basic text extraction, then parse for structure
    const rawText = await extractTextFromImage(imageDataUrl);

    if (!rawText.trim()) {
      return NextResponse.json(plainTextToDocument(""));
    }

    // If the text looks like it might have structure (multi-line), try to parse it
    const doc = rawText.includes("\n") || rawText.includes("|")
      ? parseModelOutput(rawText)
      : plainTextToDocument(rawText);

    return NextResponse.json(doc);
  } catch (error) {
    console.error("Document extraction error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
