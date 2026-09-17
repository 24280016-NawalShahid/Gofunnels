import type { NextApiRequest, NextApiResponse } from "next";
import {
  extractGoogleDriveFileId,
  fetchGoogleDriveVideo,
  cleanupTempFile,
} from "@/lib/googleDriveVideo";
import { transcribeFile } from "@/lib/transcribeAudio";

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) {
    res.status(400).json({ error: "Please provide a Google Drive/Vids video link." });
    return;
  }

  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) {
    res.status(400).json({
      error:
        "That doesn't look like a Google Drive or Google Vids link (expected something like https://docs.google.com/videos/d/.../play or https://drive.google.com/file/d/.../view).",
    });
    return;
  }

  let videoPath: string | undefined;

  try {
    videoPath = await fetchGoogleDriveVideo(fileId);
    const { fullText, chunks } = await transcribeFile(videoPath);

    if (!fullText) {
      res.status(422).json({
        error:
          "Couldn't detect any speech in this video. It may not have an audio track, or the download didn't come through correctly.",
      });
      return;
    }

    res.status(200).json({ fullText, chunks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const notConnected = /not connected to google/i.test(message);
    res.status(notConnected ? 401 : 502).json({
      error: `Could not fetch/transcribe this video: ${message}`,
    });
  } finally {
    if (videoPath) {
      await cleanupTempFile(videoPath);
    }
  }
}
