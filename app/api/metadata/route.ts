import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("note_metadata")
    .select("note_id,pinned,tags,versions")
    .eq("user_id", userData.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = userData.user.id;

  const body = await req.json().catch(() => ({}));
  const { noteId, pinned, tags = [], versions } = body || {};
  if (!noteId) {
    return NextResponse.json({ error: "Missing noteId" }, { status: 400 });
  }

  // Verify note belongs to user before writing metadata
  const { data: noteOwner, error: noteError } = await supabaseAdmin
    .from("notes")
    .select("user_id")
    .eq("id", noteId)
    .single();

  if (noteError || !noteOwner || noteOwner.user_id !== userId) {
    return NextResponse.json({ error: "Note not found for user" }, { status: 403 });
  }

  const payload = {
    note_id: noteId,
    user_id: userId,
    pinned: !!pinned,
    tags,
    versions: versions || [],
  };

  const { error: upsertError } = await supabaseAdmin
    .from("note_metadata")
    .upsert(payload, { onConflict: "note_id" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
