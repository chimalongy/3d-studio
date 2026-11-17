import { NextResponse } from "next/server";
import { startCharacterWorkflow } from "../../../../lib/workflows.js";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await startCharacterWorkflow(body);
    return NextResponse.json(result, { status: 202 });
  } catch (e) {
    console.error("Error starting character workflow:", e);
    return NextResponse.json(
      { error: e.message || "Could not start character workflow" },
      { status: 400 }
    );
  }
}