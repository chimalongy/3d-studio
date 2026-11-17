import { NextResponse } from "next/server";
import { saveSettings } from "../../../lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request) {
  try {
    const body = await request.json();
    await saveSettings(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to save settings" }, { status: 400 });
  }
}
