import { NextRequest, NextResponse } from "next/server";
import { extractTextFromImage } from "@/lib/image-ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const imageDataUrl = body?.imageDataUrl;

    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "A valid imageDataUrl is required" },
        { status: 400 }
      );
    }

    const text = await extractTextFromImage(imageDataUrl);

    return NextResponse.json({
      text,
      hasText: text.length > 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
