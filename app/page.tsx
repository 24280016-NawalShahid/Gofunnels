"use client";

import { useMemo, useRef, useState } from "react";

type LinkSegment = {
  start: number;
  duration: number;
  timestamp: string;
  text: string;
};

type UploadChunk = {
  start: number;
  end: number;
  text: string;
};

type TranscriptResult =
  | { mode: "link"; videoId: string; segments: LinkSegment[]; fullText: string }
  | { mode: "upload"; fullText: string; chunks: UploadChunk[] };

function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

export default function Home() {
  const [tab, setTab] = useState<"link" | "upload">("upload");

  // Link mode state
  const [url, setUrl] = useState("");

  // Upload mode state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [phase, setPhase] = useState<"idle" | "uploading" | "transcribing">(
    "idle"
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [copied, setCopied] = useState(false);

  const displayText = useMemo(() => {
    if (!result) return "";
    if (!showTimestamps) return result.fullText;
    if (result.mode === "link") {
      return result.segments.map((s) => `[${s.timestamp}] ${s.text}`).join("\n");
    }
    return result.chunks
      .map((c) => `[${formatSeconds(c.start)}] ${c.text}`)
      .join("\n");
  }, [result, showTimestamps]);

  function resetOutputs() {
    setError(null);
    setResult(null);
    setCopied(false);
  }

  async function handleLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    resetOutputs();

    try {
      const res = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setResult({ mode: "link", ...data });
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleFilePicked(picked: File | null) {
    resetOutputs();
    setFile(picked);
  }

  function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    resetOutputs();
    setLoading(true);
    setPhase("uploading");
    setUploadPct(0);

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/transcribe-upload");

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setUploadPct(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    xhr.upload.onload = () => {
      setPhase("transcribing");
    };

    xhr.onload = () => {
      setLoading(false);
      setPhase("idle");
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // ignore parse errors, handled below
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        setError(data.error ?? `Upload failed (status ${xhr.status}).`);
        return;
      }

      setResult({ mode: "upload", fullText: data.fullText, chunks: data.chunks });
    };

    xhr.onerror = () => {
      setLoading(false);
      setPhase("idle");
      setError("Network error while uploading. Please try again.");
    };

    xhr.send(formData);
  }

  function cancelUpload() {
    xhrRef.current?.abort();
    setLoading(false);
    setPhase("idle");
    setUploadPct(0);
  }

  async function handleCopy() {
    if (!displayText) return;
    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy to clipboard.");
    }
  }

  function handleDownload() {
    if (!displayText || !result) return;
    const blob = new Blob([displayText], { type: "text/plain;charset=utf-8" });
    const name = result.mode === "link" ? result.videoId : (file?.name ?? "transcript");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `transcript-${name.replace(/\.[^.]+$/, "")}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:py-16">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Video Transcript Grabber
        </h1>
        <p className="mt-3 text-base text-slate-600">
          Upload a Google Drive/Vids video (or any video/audio file) — or
          paste a YouTube link — and get the full transcript in minutes.
        </p>
      </header>

      <div className="mb-4 flex justify-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => {
            setTab("upload");
            resetOutputs();
          }}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            tab === "upload"
              ? "bg-brand-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Upload a video file
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("link");
            resetOutputs();
          }}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            tab === "link"
              ? "bg-brand-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Paste a YouTube link
        </button>
      </div>

      {tab === "upload" ? (
        <form
          onSubmit={handleUploadSubmit}
          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleFilePicked(dropped);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
              isDragging
                ? "border-brand-500 bg-brand-50"
                : "border-slate-300 hover:border-brand-400"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*"
              className="hidden"
              onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-sm font-medium text-slate-700">
                {file.name}{" "}
                <span className="text-slate-400">
                  ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                </span>
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700">
                  Drag & drop a video here, or click to choose a file
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Download the video from Google Drive/Vids first, then drop
                  it here. MP4, MOV, WEBM, MP3, WAV — up to 2GB.
                </p>
              </>
            )}
          </div>

          {phase === "uploading" && (
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
              <span className="w-12 text-right text-xs text-slate-500">
                {uploadPct}%
              </span>
            </div>
          )}
          {phase === "transcribing" && (
            <p className="text-center text-sm text-slate-600">
              Uploaded. Transcribing audio now — this can take a few minutes
              for longer videos (first run also downloads the speech model,
              ~150–300MB, one time only)…
            </p>
          )}

          <div className="flex justify-center gap-2">
            <button
              type="submit"
              disabled={loading || !file}
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Working…" : "Get transcript"}
            </button>
            {loading && (
              <button
                type="button"
                onClick={cancelUpload}
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <form
          onSubmit={handleLinkSubmit}
          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
        >
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Fetching…" : "Get transcript"}
          </button>
        </form>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <section className="mt-6 flex flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showTimestamps}
                onChange={(e) => setShowTimestamps(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Show timestamps
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {copied ? "Copied!" : "Copy text"}
              </button>
              <button
                onClick={handleDownload}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Download .txt
              </button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800">
              {displayText}
            </pre>
          </div>
        </section>
      )}

      <footer className="mt-auto pt-12 text-center text-xs text-slate-400">
        Uploaded files are transcribed locally on this server and deleted
        immediately after. YouTube links need captions (manual or
        auto-generated) to be available.
      </footer>
    </main>
  );
}
