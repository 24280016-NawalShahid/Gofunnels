# Video Transcript Grabber

A tiny internal tool for getting a video's transcript in minutes instead of
re-watching it. Paste a link and get the transcript back — for:

- **Google Drive / Google Vids links** (e.g. `docs.google.com/videos/d/.../play`)
  — Google doesn't expose transcripts *or* raw video downloads for these
  through its public API, so the app uses your own logged-in Google session
  (set up once, locally) to fetch the video the same way your browser would
  when you watch it, then transcribes the audio itself with a local,
  open-source speech-to-text model. **This is experimental** — it depends
  on the internal structure of Google's video player, which isn't a stable
  public API, so it may need troubleshooting and could break if Google
  changes how it serves video.
- **YouTube links** — instant, since YouTube already provides captions for
  most videos.
- **Upload a video file directly** — always available as a fallback (e.g.
  for a video you were sent as an actual file, or if the Drive/Vids link
  flow above doesn't work for a particular video).

Either way you get: timestamps (toggle on/off), copy to clipboard, and
download as `.txt`.

## Run it on your laptop

Requires [Node.js](https://nodejs.org) 18 or newer. `npm install` also
downloads a Chromium browser (for the Drive/Vids link flow) and bundles
`ffmpeg` — no separate installs needed.

```bash
git clone https://github.com/24280016-NawalShahid/Gofunnels.git
cd Gofunnels
git checkout claude/google-video-transcript-app-hau86s
npm install
npm run dev
```

Open **http://localhost:3000**.

### One-time setup: connect your Google account (for Drive/Vids links)

```bash
npm run connect-google
```

This opens a real browser window — log into the Google account that has
view access to the videos you want transcripts for, then come back to the
terminal and press Enter. This saves a session file
(`.google-session.json`) **locally on your machine only** — it's never
committed to the repo and nobody else can read it unless they have access
to your laptop. Each colleague running the app on their own laptop does
this same one-time step with their own account.

### Transcribing a Google Drive / Google Vids link

Paste the link (e.g. `https://docs.google.com/videos/d/.../play`) into the
**Paste a link** tab and click **Get transcript**. The app will:

1. Load the video's page using your saved Google session.
2. Discover and download the underlying video stream.
3. Transcribe it locally (see model notes below).

If this fails with an error, it's most likely because Google's player
markup/streaming behavior differs from what was tested — see **Known
limitations** below, and the **Upload a video file** tab as a fallback
(you'd need the file downloaded to your computer first, e.g. sent to you
directly rather than via a Vids-only link).

### Transcribing a YouTube link

Paste the URL into the same **Paste a link** tab — this one's instant
since it just reads YouTube's existing captions.

### Uploading a file directly

Switch to the **Upload a video file** tab, drag in a video/audio file, and
click **Get transcript**. Same local transcription as the link flow, just
skipping the "find and download the stream" step.

### About the speech-to-text model

First transcription (via any path) downloads a model (~150–300MB) — this
needs internet access once, then is cached locally and every future
transcription runs fully offline. Transcription itself takes real time —
roughly a few minutes for a short clip, up to tens of minutes for a long
walkthrough, depending on your laptop's CPU.

## Sharing it with colleagues from your laptop

Your laptop has to stay on and running the server for either option below.
Each colleague still needs their own `npm run connect-google` for Drive
links to work under their own account/permissions.

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

Note: if you run this centrally (one laptop serving the whole team), the
Google session belongs to whoever ran `connect-google` on that machine —
everyone using the shared link would be fetching Drive videos as that one
account. For per-person Drive permissions, each colleague should run their
own instance and their own `connect-google`.

**Longer-term:** for something colleagues can reach without your laptop
being on, deploy it to a host like Vercel/Render/Railway instead — ask if
you want that set up later.

## How it works

- **Google Drive/Vids link path:** `lib/googleDriveVideo.ts` extracts the
  file ID from the URL, launches a headless Chromium (via Playwright) using
  the session saved by `npm run connect-google`, loads the video's
  `/preview` page, watches network responses for the video/audio stream the
  player loads, and downloads it via ranged HTTP requests using that same
  authenticated session. `pages/api/transcribe-drive-link.ts` wires that
  into transcription.
- **Upload path:** `pages/api/transcribe-upload.ts` receives the file
  (`formidable`).
- **Both** upload and Drive-link paths extract mono 16kHz PCM audio with a
  bundled `ffmpeg` binary (`ffmpeg-static`), then run it through a local
  Whisper model via `@xenova/transformers` (pure JS/ONNX — no Python) to
  produce timestamped text (`lib/transcribeAudio.ts`). Any downloaded/
  uploaded file is deleted immediately after processing.
- **YouTube link path:** `lib/youtube.ts` parses the video ID;
  `app/api/transcript/route.ts` fetches its caption track via the
  `youtube-transcript` package (no API key needed).
- `app/page.tsx` is the single-page UI, auto-detecting whether a pasted
  link is YouTube or Drive/Vids and routing to the right endpoint.

## Configuration

- `WHISPER_MODEL` (optional env var) — override the default
  `Xenova/whisper-base` model, e.g. `Xenova/whisper-small` for better
  accuracy (slower) or `Xenova/whisper-tiny.en` for speed on English-only
  audio.

## Known limitations

- **The Drive/Vids link flow is the least proven part of this app.** It
  works by watching what Google's own video player loads over the network
  and reconstructing the file from that — there's no supported API for
  this, so it depends on assumptions about how that player currently
  serves video (e.g. that it exposes a directly range-fetchable URL rather
  than encrypted/segmented delivery). If it doesn't work for a given video,
  please share the exact error message so it can be adjusted, or use the
  Upload tab as a fallback.
- It only works for videos your connected Google account already has view
  access to — it can't bypass permissions.
- Upload/transcription quality and speed depend on the model size and your
  CPU — there's no GPU acceleration by default.
- YouTube links only work for videos with captions (manual or
  auto-generated). Private/age-restricted/caption-disabled videos will
  show an error.
- All paths need outbound internet access for the first-run model download
  (and the Drive-link path needs it every time, to reach Google); after the
  model is cached, uploads transcribe fully offline.
