import path from "path";
import { existsSync } from "fs";

export const GOOGLE_SESSION_PATH = path.join(
  process.cwd(),
  ".google-session.json"
);

export function hasGoogleSession(): boolean {
  return existsSync(GOOGLE_SESSION_PATH);
}
