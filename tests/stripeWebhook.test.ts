import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const paymentsUpsert = vi.fn();
  const profilesUpsert = vi.fn();
  const fromMock = vi.fn((table: string) => {
    if (table === "payments") return { upsert: paymentsUpsert } as any;
    if (table === "profiles") return { upsert: profilesUpsert } as any;
    return {} as any;
  });
  return { paymentsUpsert, profilesUpsert, fromMock };
});

vi.mock("@/app/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.fromMock,
  },
}));

let fakeEvent: any;
const constructEvent = vi.fn(() => fakeEvent);
const stripeInstance = { webhooks: { constructEvent } } as any;
vi.mock("stripe", () => ({ default: vi.fn(() => stripeInstance) }));

const baseHeaders = {
  "stripe-signature": "sig",
};

let webhookHandler: any;

describe("Stripe webhook handler", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    fakeEvent = {
      type: "checkout.session.completed",
      id: "evt_123",
      data: {
        object: {
          id: "cs_123",
          client_reference_id: "user-1",
          metadata: { user_id: "user-1" },
          customer_email: "test@example.com",
          amount_total: 1500,
          currency: "eur",
          payment_status: "paid",
          status: "complete",
        },
      },
    };
    mocks.paymentsUpsert.mockResolvedValue({ data: null, error: null });
    mocks.profilesUpsert.mockResolvedValue({ data: null, error: null });
    vi.resetModules();
    webhookHandler = (await import("../app/api/webhooks/stripe/route")) .POST;
  });

  it("upserts payment and sets profile to PRO on checkout.session.completed", async () => {
    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({}),
    });

    const res = await webhookHandler(req as any);
    expect(res.status).toBe(200);
    expect(mocks.fromMock).toHaveBeenCalledWith("payments");
    expect(mocks.fromMock).toHaveBeenCalledWith("profiles");
    expect(mocks.paymentsUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.profilesUpsert).toHaveBeenCalledWith({ id: "user-1", plan: "pro" }, { onConflict: "id" });
  });

  it("returns 400 when signature missing", async () => {
    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await webhookHandler(req as any);
    expect(res.status).toBe(400);
  });
});
