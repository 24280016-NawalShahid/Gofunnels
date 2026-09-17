import { chromium } from "playwright";
import { open, rm } from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { GOOGLE_SESSION_PATH, hasGoogleSession } from "./googleSession";

export function extractGoogleDriveFileId(input: string): string | null {
  const trimmed = input.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "docs.google.com" && host !== "drive.google.com") {
    return null;
  }

  // https://docs.google.com/videos/d/<id>/(play|preview|edit)...
  // https://drive.google.com/file/d/<id>/(view|preview)...
  const dMatch = url.pathname.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (dMatch) return dMatch[1];

  // https://drive.google.com/open?id=<id>
  const idParam = url.searchParams.get("id");
  if (idParam) return idParam;

  return null;
}

type MediaCandidate = {
  url: string;
  contentType: string;
  total?: number;
};

const MEDIA_URL_HINTS = [
  "videoplayback",
  "googlevideo.com",
  "get_video_info",
  "get_video_play_info",
  "/media/",
  "docs.google.com/uc",
];

function looksLikeMedia(contentType: string, url: string): boolean {
  if (contentType.includes("video") || contentType.includes("audio")) return true;
  if (contentType === "application/octet-stream" || contentType === "binary/octet-stream") {
    return MEDIA_URL_HINTS.some((hint) => url.includes(hint));
  }
  return false;
}

const CHUNK_SIZE = 32 * 1024 * 1024; // 32MB per range request

async function downloadRanged(
  requestContext: import("playwright").APIRequestContext,
  candidate: MediaCandidate,
  referer: string,
  destPath: string
): Promise<void> {
  const handle = await open(destPath, "w");
  try {
    let offset = 0;
    const total = candidate.total;
    let consecutiveEmpty = 0;

    // Unknown total: try a plain GET first, it may just return everything.
    if (!total) {
      const res = await requestContext.get(candidate.url, {
        headers: { Referer: referer },
        timeout: 120000,
      });
      if (!res.ok()) {
        throw new Error(`Video server responded with status ${res.status()}.`);
      }
      const body = await res.body();
      await handle.write(body, 0, body.length, 0);
      return;
    }

    while (offset < total) {
      const end = Math.min(offset + CHUNK_SIZE, total) - 1;
      const res = await requestContext.get(candidate.url, {
        headers: {
          Referer: referer,
          Range: `bytes=${offset}-${end}`,
        },
        timeout: 120000,
      });

      if (res.status() !== 206 && res.status() !== 200) {
        throw new Error(
          `Video server responded with status ${res.status()} while downloading (offset ${offset}/${total}).`
        );
      }

      const body = await res.body();
      if (body.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty > 2) {
          throw new Error("Video server stopped sending data before the file finished.");
        }
        continue;
      }
      consecutiveEmpty = 0;

      await handle.write(body, 0, body.length, offset);
      offset += body.length;
    }
  } finally {
    await handle.close();
  }
}

async function buildDiagnostics(
  page: import("playwright").Page,
  seenTypes: Map<string, number>,
  interestingUrls: string[]
): Promise<string> {
  const parts: string[] = [];

  try {
    parts.push(`page title: "${await page.title()}"`);
  } catch {
    parts.push("page title: <could not read>");
  }

  try {
    const bodyText = await page.evaluate(() =>
      document.body?.innerText?.slice(0, 300).replace(/\s+/g, " ").trim()
    );
    if (bodyText) parts.push(`visible text (first 300 chars): "${bodyText}"`);
  } catch {
    // ignore
  }

  try {
    const videoCount = await page.locator("video").count();
    parts.push(`<video> elements on main frame: ${videoCount}`);
  } catch {
    // ignore
  }

  try {
    const iframeSrcs = await page.locator("iframe").evaluateAll((els) =>
      els.map((el) => (el as HTMLIFrameElement).src).filter(Boolean)
    );
    if (iframeSrcs.length) {
      parts.push(`iframes found: ${iframeSrcs.slice(0, 5).join(", ")}`);
    }
  } catch {
    // ignore
  }

  if (seenTypes.size > 0) {
    const typesList = [...seenTypes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t, n]) => `${t} (x${n})`)
      .join(", ");
    parts.push(`response content-types seen: ${typesList}`);
  } else {
    parts.push("no network responses were observed at all — the page may not have loaded.");
  }

  if (interestingUrls.length > 0) {
    parts.push(
      `URLs with video/media-like hints: ${interestingUrls.slice(0, 5).join(" | ")}`
    );
  }

  try {
    const screenshotPath = path.join(os.tmpdir(), `drive-debug-${randomUUID()}.png`);
    await page.screenshot({ path: screenshotPath });
    parts.push(`screenshot saved to: ${screenshotPath}`);
  } catch {
    // ignore
  }

  return parts.join(" | ");
}

/**
 * Uses a previously saved Google login session to load a Drive/Vids video
 * page, discover the underlying media URL the player streams from, and
 * download it to a local temp file. Returns the path to that file.
 *
 * This depends on the current structure of Google's video player and is
 * inherently best-effort: if Google changes how it serves video, this will
 * need updating.
 */
export async function fetchGoogleDriveVideo(fileId: string): Promise<string> {
  if (!hasGoogleSession()) {
    throw new Error(
      "Not connected to Google yet. Run `npm run connect-google` once (it opens a browser to log in), then try again."
    );
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: GOOGLE_SESSION_PATH });
  const page = await context.newPage();

  const candidates = new Map<string, MediaCandidate>();
  const seenTypes = new Map<string, number>();
  const interestingUrls: string[] = [];

  page.on("response", (response) => {
    const headers = response.headers();
    const contentType = (headers["content-type"] || "").split(";")[0].trim();
    seenTypes.set(contentType || "(none)", (seenTypes.get(contentType || "(none)") ?? 0) + 1);

    const url = response.url();
    if (
      interestingUrls.length < 20 &&
      MEDIA_URL_HINTS.some((hint) => url.includes(hint))
    ) {
      interestingUrls.push(url);
    }

    if (!looksLikeMedia(contentType, url)) return;

    let total: number | undefined;
    const contentRange = headers["content-range"];
    if (contentRange) {
      const m = /\/(\d+)\s*$/.exec(contentRange);
      if (m) total = parseInt(m[1], 10);
    } else if (headers["content-length"]) {
      total = parseInt(headers["content-length"], 10);
    }
    const existing = candidates.get(url);
    if (!existing || (total ?? 0) > (existing.total ?? 0)) {
      candidates.set(url, { url, contentType, total });
    }
  });

  const playUrl = `https://docs.google.com/videos/d/${fileId}/preview`;

  try {
    await page.goto(playUrl, { waitUntil: "load", timeout: 60000 });

    // Programmatic play() often fails silently (no src loaded yet, or
    // browsers block autoplay without a real user gesture). Try both a
    // direct call and a real click in the middle of the viewport, which
    // usually lands on a big play-button overlay.
    try {
      await page.locator("video").first().evaluate((el: HTMLVideoElement) => el.play());
    } catch {
      // ignore
    }
    try {
      const box = await page.viewportSize();
      if (box) {
        await page.mouse.click(box.width / 2, box.height / 2);
      }
    } catch {
      // ignore
    }

    await page.waitForTimeout(10000);

    if (candidates.size === 0) {
      const diagnostics = await buildDiagnostics(page, seenTypes, interestingUrls);
      throw new Error(
        `Could not find a playable video stream on that page. Diagnostics: ${diagnostics}`
      );
    }

    const best = [...candidates.values()].sort(
      (a, b) => (b.total ?? 0) - (a.total ?? 0)
    )[0];

    const destPath = path.join(os.tmpdir(), `${randomUUID()}.mp4`);
    await downloadRanged(context.request, best, playUrl, destPath);
    return destPath;
  } finally {
    await browser.close();
  }
}

export async function cleanupTempFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true }).catch(() => {});
}
