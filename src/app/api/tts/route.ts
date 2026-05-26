import { NextRequest, NextResponse } from "next/server";
import {
  generateAudio,
  getAvailableVoices,
  getModelLoadProgress,
  getModelLoadStatusText,
  isModelLoading,
  isModelReady,
  preloadModel,
  SAMPLE_RATE,
} from "@/lib/tts-model";
import { buildSpeechPlan, buildSpeechPlanFromText, type TTSRequestBlock } from "@/lib/editor-blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveSpeechPlan(body: { text?: unknown; blocks?: unknown }) {
  if (Array.isArray(body.blocks)) {
    return buildSpeechPlan(body.blocks as TTSRequestBlock[], 300);
  }

  if (typeof body.text === "string") {
    return buildSpeechPlanFromText(body.text, 300);
  }

  return [];
}

// GET - Check model status and get available voices
export async function GET() {
  // If we aren't ready and aren't currently loading, kick off a background load.
  if (!isModelReady() && !isModelLoading()) {
    preloadModel().catch(() => {
      // ignore; errors are logged in preloadModel
    });
  }

  return NextResponse.json({
    ready: isModelReady(),
    loading: isModelLoading(),
    progress: getModelLoadProgress(),
    statusText: getModelLoadStatusText(),
    voices: getAvailableVoices(),
    sampleRate: SAMPLE_RATE,
  });
}

// POST - Generate TTS audio with streaming
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { voice = "af_heart", speed = 1 } = body;
    const speechPlan = resolveSpeechPlan(body);

    if (speechPlan.length === 0) {
      return NextResponse.json(
        { error: "Readable text is required" },
        { status: 400 }
      );
    }

    // Create a streaming response using Server-Sent Events
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: "start",
              totalChunks: speechPlan.length,
              sampleRate: SAMPLE_RATE
            })}\n\n`)
          );

          // Process each chunk
          for (let i = 0; i < speechPlan.length; i++) {
            const chunk = speechPlan[i];
            console.log(`[TTS] Processing ${chunk.label} ${i + 1}/${speechPlan.length}: "${chunk.text.substring(0, 50)}..."`);

            try {
              const result = await generateAudio(chunk.text, voice, speed);

              // Convert Float32Array to base64 for transmission
              const audioBuffer = Buffer.from(result.audio.buffer, result.audio.byteOffset, result.audio.byteLength);
              const base64Audio = audioBuffer.toString("base64");

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: "audio",
                  chunkIndex: i,
                  totalChunks: speechPlan.length,
                  audio: base64Audio,
                  text: chunk.text,
                  blockId: chunk.blockId,
                  label: chunk.label,
                  source: chunk.source,
                })}\n\n`)
              );
            } catch (chunkError) {
              console.error(`[TTS] Error processing chunk ${i}:`, chunkError);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: "error",
                  chunkIndex: i,
                  error: chunkError instanceof Error ? chunkError.message : "Unknown error",
                })}\n\n`)
              );
            }
          }

          // Send completion signal
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "complete" })}\n\n`)
          );

          controller.close();
        } catch (error) {
          console.error("[TTS] Stream error:", error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Unknown error",
            })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("[TTS] Request error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
