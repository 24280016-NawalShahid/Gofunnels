# Video Transcript Grabber

A tiny internal tool for getting a video's transcript in minutes instead of
re-watching it:

- **Upload a video file** — the primary path for Google Drive / Google Vids
  videos (and Zoom recordings, or any video/audio file). Google Drive
  doesn't expose transcripts via its API, so the app transcribes the audio
  itself, locally, using an open-source speech-to-text model. No API key,
  no cloud service — everything runs on the machine you start the app on.
- **Paste a YouTube link** — still works, and is instant, since YouTube
  already provides captions for most videos.

Either way you get: timestamps (toggle on/off), copy to clipboard, and
download as `.txt`.

## Run it on your laptop

Requires [Node.js](https://nodejs.org) 18 or newer. No Python, no ffmpeg
install, no Google account/API key needed — everything required is bundled
by `npm install`.

```bash
git clone https://github.com/24280016-NawalShahid/Gofunnels.git
cd Gofunnels
git checkout claude/google-video-transcript-app-hau86s
npm install
npm run dev
```

Open **http://localhost:3000**.

### Transcribing a Google Drive / Google Vids video

1. Open the video in Drive/Vids and download it to your computer (Drive's
   **⋮ menu → Download**, or the download icon in Vids).
2. On the **Upload a video file** tab, drag the downloaded file in (or
   click to browse to it) and click **Get transcript**.
3. First time only: the app downloads a speech-to-text model
   (~150–300MB) — this needs internet access once and is then cached
   locally for every future transcription, which runs fully offline.
4. Transcription itself takes real time — roughly a few minutes for a
   short clip, up to tens of minutes for a long walkthrough, depending on
   your laptop's CPU. Leave the tab open until it finishes.

### Transcribing a YouTube video

Switch to the **Paste a YouTube link** tab, paste the URL, click **Get
transcript** — this one's instant since it just reads YouTube's existing
captions.

## Sharing it with colleagues from your laptop

Your laptop has to stay on and running the server for either option below.

**Option A — same office/WiFi network (simplest):**

```bash
npm run dev:lan
```

Then find your laptop's local IP address:
- macOS: `ipconfig getifaddr en0`
- Windows (PowerShell): `ipconfig` (look for "IPv4 Address")
- Linux: `hostname -I`

Share `http://<your-ip>:3000` (e.g. `http://192.168.1.42:3000`) — anyone
on the same network/VPN can open it directly. For a steadier version, run
`npm run build` once, then `npm run start:lan` instead of `dev:lan`.

**Option B — colleagues outside your network:**

Use a tunnel to get a temporary public URL that forwards to your laptop:

```bash
npm run build && npm run start   # in one terminal
npx localtunnel --port 3000      # in another terminal
```

This prints a public `https://...loca.lt` URL you can share. (Alternatives:
`ngrok http 3000` if you have an ngrok account, or Cloudflare Tunnel.)

**Longer-term:** for something colleagues can reach without your laptop
being on, deploy it to a host like Vercel/Render/Railway instead — ask if
you want that set up later. Note: file-upload transcription is CPU-heavy,
so a serverless host (Vercel) would need a longer-running server tier
instead of the default functions.

## How it works

- **Upload path:** `pages/api/transcribe-upload.ts` receives the file
  (`formidable`), extracts mono 16kHz PCM audio with a bundled `ffmpeg`
  binary (`ffmpeg-static`), then runs it through a local Whisper model via
  `@xenova/transformers` (pure JS/ONNX — no Python) to produce timestamped
  text. The uploaded file is deleted immediately after processing.
- **Link path:** `lib/youtube.ts` parses the video ID out of a YouTube URL;
  `app/api/transcript/route.ts` fetches its caption track via the
  `youtube-transcript` package (reads YouTube's public caption data, no
  API key needed).
- `app/page.tsx` is the single-page UI for both modes, with copy/download/
  timestamp controls.

## Configuration

- `WHISPER_MODEL` (optional env var) — override the default
  `Xenova/whisper-base` model, e.g. `Xenova/whisper-small` for better
  accuracy (slower) or `Xenova/whisper-tiny.en` for speed on English-only
  audio.

## Known limitations

- Upload transcription quality/speed depends on the model size and your
  CPU — there's no GPU acceleration by default.
- YouTube links only work for videos with captions (manual or
  auto-generated). Private/age-restricted/caption-disabled videos will
  show an error.
- Both YouTube caption scraping and Whisper's first-run model download
  need outbound internet access; after the model is cached, uploads
  transcribe fully offline.
