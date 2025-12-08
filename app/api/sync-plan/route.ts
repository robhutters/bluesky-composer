import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  try {
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = userData.user.id;

    const { data: payments, error: payError } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["paid", "succeeded", "complete"])
      .limit(1);

    if (payError) {
      return NextResponse.json({ error: payError.message }, { status: 500 });
    }

    if (payments && payments.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from("profiles")
        .upsert({ id: userId, plan: "pro" }, { onConflict: "id" });
      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
      return NextResponse.json({ plan: "pro" });
    }

    return NextResponse.json({ plan: "free" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
