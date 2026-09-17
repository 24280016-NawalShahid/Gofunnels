import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import { rm } from "fs/promises";
import os from "os";
import { transcribeFile } from "@/lib/transcribeAudio";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const form = formidable({
    maxFileSize: MAX_FILE_SIZE_BYTES,
    uploadDir: os.tmpdir(),
    keepExtensions: true,
    multiples: false,
  });

  let uploadedPath: string | undefined;

  try {
    const [, files] = await form.parse(req);
    const fileField = files.file;
    const file = Array.isArray(fileField) ? fileField[0] : fileField;

    if (!file) {
      res.status(400).json({ error: "No file was uploaded." });
      return;
    }

    uploadedPath = file.filepath;

    const { fullText, chunks } = await transcribeFile(uploadedPath);

    if (!fullText) {
      res.status(422).json({
        error:
          "Couldn't detect any speech in this file. Make sure it has an audio track with spoken words.",
      });
      return;
    }

    res.status(200).json({ fullText, chunks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const tooLarge = /maxFileSize/i.test(message);
    res.status(tooLarge ? 413 : 500).json({
      error: tooLarge
        ? "That file is larger than the 2GB limit."
        : `Could not transcribe this file: ${message}`,
    });
  } finally {
    if (uploadedPath) {
      await rm(uploadedPath, { force: true }).catch(() => {});
    }
  }
}
