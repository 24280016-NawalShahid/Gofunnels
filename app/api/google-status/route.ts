import { NextResponse } from "next/server";
import { hasGoogleSession } from "@/lib/googleSession";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ connected: hasGoogleSession() });
}
