import { NextRequest, NextResponse } from "next/server";
import { generateAudio, SAMPLE_RATE } from "@/lib/tts-model";
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

// Helper to create WAV file from audio data
function createWavFile(audioData: Float32Array[], sampleRate: number): Buffer {
  // Calculate total length
  const totalSamples = audioData.reduce((sum, chunk) => sum + chunk.length, 0);
  const dataSize = totalSamples * 4; // 32-bit float = 4 bytes
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const buffer = Buffer.alloc(fileSize);
  const view = new DataView(buffer.buffer);

  // Write WAV header
  // "RIFF" chunk descriptor
  buffer.write("RIFF", 0);
  view.setUint32(4, fileSize - 8, true); // File size - 8
  buffer.write("WAVE", 8);

  // "fmt " subchunk
  buffer.write("fmt ", 12);
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 3, true);  // AudioFormat (3 for IEEE float)
  view.setUint16(22, 1, true);  // NumChannels (1 for mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 4, true); // ByteRate
  view.setUint16(32, 4, true);  // BlockAlign
  view.setUint16(34, 32, true); // BitsPerSample

  // "data" subchunk
  buffer.write("data", 36);
  view.setUint32(40, dataSize, true);

  // Write audio data
  let offset = 44;
  for (const chunk of audioData) {
    for (let i = 0; i < chunk.length; i++) {
      view.setFloat32(offset, chunk[i], true);
      offset += 4;
    }
  }

  return buffer;
}

// POST - Generate complete audio file for download
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { voice = "af_heart", speed = 1, format = "wav" } = body;
    const speechPlan = resolveSpeechPlan(body);

    if (speechPlan.length === 0) {
      return NextResponse.json(
        { error: "Readable text is required" },
        { status: 400 }
      );
    }

    console.log(`[TTS Download] Processing ${speechPlan.length} chunks...`);

    // Generate audio for all chunks
    const audioChunks: Float32Array[] = [];

    for (let i = 0; i < speechPlan.length; i++) {
      const chunk = speechPlan[i];
      console.log(`[TTS Download] Chunk ${i + 1}/${speechPlan.length}`);

      const result = await generateAudio(chunk.text, voice, speed);
      audioChunks.push(result.audio);
    }

    // Create WAV file
    const wavBuffer = createWavFile(audioChunks, SAMPLE_RATE);

    console.log(`[TTS Download] Generated ${wavBuffer.length} bytes`);

    // Return the WAV file as Uint8Array for Response compatibility
    return new Response(new Uint8Array(wavBuffer), {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": `attachment; filename="tts-output.wav"`,
        "Content-Length": wavBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[TTS Download] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
