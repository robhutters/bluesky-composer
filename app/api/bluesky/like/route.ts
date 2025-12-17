import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { identifier, appPassword, subjectUri, subjectCid } = await req.json();
    if (!identifier || !appPassword || !subjectUri || !subjectCid) {
      return NextResponse.json({ error: "Missing credentials or subject" }, { status: 400 });
    }

    const sessionRes = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password: appPassword }),
    });

    if (!sessionRes.ok) {
      const detail = await sessionRes.text().catch(() => "");
      return NextResponse.json({ error: `Login failed: ${sessionRes.status} ${detail}`.trim() }, { status: 401 });
    }

    const session = await sessionRes.json();
    const accessJwt = session.accessJwt;
    const did = session.did;
    if (!accessJwt || !did) {
      return NextResponse.json({ error: "Missing session data from Bluesky" }, { status: 500 });
    }

    const record = {
      $type: "app.bsky.feed.like",
      subject: { uri: subjectUri, cid: subjectCid },
      createdAt: new Date().toISOString(),
    };

    const likeRes = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessJwt}`,
      },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.like",
        record,
      }),
    });

    if (!likeRes.ok) {
      const detail = await likeRes.text().catch(() => "");
      return NextResponse.json({ error: `Like failed: ${likeRes.status} ${detail}`.trim() }, { status: likeRes.status });
    }

    const json = await likeRes.json();
    return NextResponse.json({ success: true, uri: json?.uri || null });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to like post" }, { status: 500 });
  }
}
