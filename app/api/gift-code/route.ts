import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const allowedCodes = (process.env.GIFT_CODES || "")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

export async function POST(req: Request) {
  console.log('Searching for gift codes...')
  console.log(process.env.GIFT_CODES)

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const body = await req.json().catch(() => ({}));
  const clientId = body?.clientId;
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  if (!allowedCodes.length) {
    return NextResponse.json({ error: "No gift codes available" }, { status: 404 });
  }

  try {
    // Check if this client already received a code
    const { data: existingOffer } = await supabase
      .from("composer_saves")
      .select("kind")
      .eq("client_id", clientId)
      .ilike("kind", "gift_offer:%")
      .limit(1);
    if (existingOffer && existingOffer.length) {
      const code = existingOffer[0].kind.replace("gift_offer:", "");
      return NextResponse.json({ code, existing: true });
    }

    // Get redeemed codes
    const { data: redeemedRows } = await supabase
      .from("composer_saves")
      .select("kind")
      .ilike("kind", "pro_purchase_gift:%");
    const redeemed = new Set((redeemedRows || []).map((row) => row.kind.replace("pro_purchase_gift:", "")));

    // Filter available codes
    const available = allowedCodes.filter((c) => !redeemed.has(c));
    if (!available.length) {
      return NextResponse.json({ error: "All codes redeemed" }, { status: 404 });
    }

    // Pick a random available code
    const code = available[Math.floor(Math.random() * available.length)];

    // Record that we offered this code to this client
    await supabase.from("composer_saves").insert({
      client_id: clientId,
      kind: `gift_offer:${code}`,
    });

    return NextResponse.json({ code });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch gift code" },
      { status: 500 }
    );
  }
}
