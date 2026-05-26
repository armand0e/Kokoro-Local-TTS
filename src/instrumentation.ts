// This file runs once when the Next.js server starts
// We use it to preload the TTS model

export async function register() {
  // Only run on the server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Server starting, preloading TTS model...");

    // Dynamic import to avoid issues during build
    const { preloadModel } = await import("@/lib/tts-model");

    // Start loading the model in the background
    preloadModel().catch((error) => {
      console.error("[Instrumentation] Failed to preload TTS model:", error);
    });
  }
}
