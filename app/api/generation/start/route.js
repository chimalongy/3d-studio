import { NextResponse } from "next/server";
import { startVideoWorkflow } from "../../../../lib/workflows";
export const runtime = "nodejs";
export async function POST(request) {
  try { const body = await request.json(); const result = await startVideoWorkflow(body); return NextResponse.json(result, { status: 202 }); }
  catch (e) { return NextResponse.json({ error: e.message || "Could not start workflow" }, { status: 400 }); }
}