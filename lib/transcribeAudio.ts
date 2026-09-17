import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { existsSync } from "fs";

export type TranscriptChunk = {
  start: number;
  end: number;
  text: string;
};

let pipelinePromise: Promise<any> | null = null;

async function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      // Keep everything local: don't try browser cache APIs, do use a
      // filesystem cache so the (~150-500MB) model only downloads once.
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      const modelId = process.env.WHISPER_MODEL || "Xenova/whisper-base";
      return pipeline("automatic-speech-recognition", modelId);
    })();
  }
  return pipelinePromise;
}

/** Extracts mono 16kHz PCM audio from a video/audio file as a Float32Array, via ffmpeg. */
export function extractPcm16k(inputPath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath || !existsSync(ffmpegPath)) {
      reject(new Error("Bundled ffmpeg binary not found."));
      return;
    }

    const args = [
      "-i",
      inputPath,
      "-f",
      "s16le",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-acodec",
      "pcm_s16le",
      "pipe:1",
    ];

    const proc = spawn(ffmpegPath as unknown as string, args);
    const chunks: Buffer[] = [];
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
        return;
      }
      const buffer = Buffer.concat(chunks);
      const int16 = new Int16Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.length / Int16Array.BYTES_PER_ELEMENT
      );
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }
      resolve(float32);
    });
  });
}

export async function transcribeFile(inputPath: string): Promise<{
  fullText: string;
  chunks: TranscriptChunk[];
}> {
  const audio = await extractPcm16k(inputPath);
  const transcriber = await getPipeline();

  const output = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  });

  const rawChunks = (output.chunks ?? []) as Array<{
    timestamp: [number, number | null];
    text: string;
  }>;

  const chunks: TranscriptChunk[] = rawChunks.map((c) => ({
    start: c.timestamp[0] ?? 0,
    end: c.timestamp[1] ?? c.timestamp[0] ?? 0,
    text: c.text.trim(),
  }));

  return {
    fullText: (output.text ?? "").trim(),
    chunks,
  };
}
