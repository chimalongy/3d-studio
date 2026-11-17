import { NextResponse } from "next/server";
import { deleteCharacter, getCharacter } from "../../../../lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const character = await getCharacter(params.id);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    return NextResponse.json({ character });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Character ID is required." }, { status: 400 });
    }
    await deleteCharacter(id);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to delete character." }, { status: 500 });
  }
}
