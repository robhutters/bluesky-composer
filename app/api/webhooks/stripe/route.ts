import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripeSecret = process.env.STRIPE_SECRET_KEY;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!webhookSecret || !stripeSecret) {
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeSecret);

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err?.message || "unknown"}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          (session.client_reference_id as string | null) ||
          (session.metadata?.user_id as string | undefined);
        if (!userId) break;

        // Record payment for auditing/idempotency
        const paymentPayload = {
          user_id: userId,
          email: session.customer_email || null,
          stripe_event_id: event.id,
          stripe_checkout_id: session.id,
          amount: session.amount_total ?? 0,
          currency: session.currency ?? "usd",
          status: session.payment_status ?? "unknown",
        };

        try {
          const { error: paymentError } = await supabaseAdmin
            .from("payments")
            .upsert(paymentPayload, { onConflict: "stripe_event_id" });
          if (paymentError) {
            console.error("Failed to record payment", paymentError);
          }
        } catch (err) {
          console.error("Unexpected error recording payment", err);
        }

        const paid =
          (session.payment_status ?? "").toLowerCase() === "paid" ||
          (session.status ?? "").toLowerCase() === "complete";

        if (paid) {
          const { error: upsertError } = await supabaseAdmin
            .from("profiles")
            .upsert(
              { id: userId, plan: "pro" },
              { onConflict: "id" }
            );
          if (upsertError) {
            console.error("Failed to set pro plan", upsertError);
            throw upsertError;
          }
        }
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Webhook handler error" },
      { status: 500 }
    );
  }
}
