import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID;
const allowedCodes = (process.env.GIFT_CODES || "")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

export async function POST(req: Request) {
  const body = await req
    .json()
    .catch(() => ({} as { clientId?: string | null | undefined; giftCode?: string }));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const giftCode = body?.giftCode?.trim().toLowerCase();
  if (giftCode) {
    if (!allowedCodes.includes(giftCode)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: user.id, email: user.email, plan: "pro" }, { onConflict: "id" });
      if (profileError) throw profileError;
      if (body?.clientId) {
        await supabase
          .from("composer_saves")
          .insert({ client_id: body.clientId, kind: "pro_purchase_gift" });
      }
      return NextResponse.json({ success: true, redeemed: true });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Failed to redeem code" },
        { status: 500 }
      );
    }
  }

  if (!stripeSecret || !priceId) {
    return NextResponse.json(
      { error: "Stripe is not configured on this server" },
      { status: 500 }
    );
  }

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  const stripe = new Stripe(stripeSecret);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?upgrade=success`,
      cancel_url: `${origin}/?upgrade=cancel`,
      metadata: {
        user_id: user.id,
        client_id: body?.clientId || "",
      },
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          client_id: body?.clientId || "",
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
