import { chromium } from "playwright";
import path from "path";
import readline from "readline/promises";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.join(__dirname, "..", ".google-session.json");

async function main() {
  console.log("Opening a browser window — log into the Google account");
  console.log("whose Drive videos you want to transcribe, then come back");
  console.log("here.\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://accounts.google.com/ServiceLogin?service=wise&continue=https://drive.google.com/");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    "\nPress Enter here once you're logged in and can see your Drive in the browser window...\n"
  );
  rl.close();

  await context.storageState({ path: sessionPath });
  await browser.close();

  console.log(`\nSaved. Session stored at ${sessionPath}`);
  console.log(
    "Keep this file private — it grants access to your Google account until you sign out or it expires."
  );
  console.log("You can now paste Google Drive/Vids links into the app.");
}

main().catch((err) => {
  console.error("Failed to connect:", err);
  process.exit(1);
});
