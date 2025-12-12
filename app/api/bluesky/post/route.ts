import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.*);base64,(.*)$/);
  if (!match) return null;
  const rawMime = match[1] || "";
  const mime = rawMime.split(";")[0]?.trim() || "application/octet-stream";
  return { mime, data: match[2] };
}

async function uploadImage(accessJwt: string, dataUrl?: string | null) {
  if (!dataUrl) return null;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const buffer = Buffer.from(parsed.data, "base64");
  const res = await fetch("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", {
    method: "POST",
    headers: {
      "Content-Type": parsed.mime || "application/octet-stream",
      Authorization: `Bearer ${accessJwt}`,
    },
    body: buffer,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Image upload failed: ${res.status} ${detail}`.trim());
  }
  const json = await res.json();
  return json?.blob || null;
}

const buildAllow = (replyControl: string, listUri?: string) => {
  if (!replyControl || replyControl === "anyone") return null;
  if (replyControl === "no_replies") return [];
  if (replyControl === "mentions") return [{ $type: "app.bsky.feed.threadgate#mentionRule" }];
  if (replyControl === "followers") return [{ $type: "app.bsky.feed.threadgate#followerRule" }];
  if (replyControl === "following") return [{ $type: "app.bsky.feed.threadgate#followingRule" }];
  if (replyControl === "list" && listUri) return [{ $type: "app.bsky.feed.threadgate#listRule", list: listUri }];
  return null;
};

export async function POST(req: Request) {
  try {
    const { identifier, appPassword, text, imageData, replyControl, replyListUri } = await req.json();
    if (!identifier || !appPassword || !text) {
      return NextResponse.json({ error: "Missing credentials or text" }, { status: 400 });
    }
    if (typeof imageData === "string" && imageData.startsWith("data:image/gif")) {
      return NextResponse.json(
        { error: "Animated GIFs are not supported for posting right now. Please use a static image." },
        { status: 400 }
      );
    }

    const sessionRes = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password: appPassword }),
    });

    if (!sessionRes.ok) {
      const detail = await sessionRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Login failed: ${sessionRes.status} ${detail}`.trim() },
        { status: 401 }
      );
    }

    const session = await sessionRes.json();
    const accessJwt = session.accessJwt;
    const did = session.did;
    if (!accessJwt || !did) {
      return NextResponse.json({ error: "Missing session data from Bluesky" }, { status: 500 });
    }

    let embed: any = undefined;
    if (imageData) {
      const blob = await uploadImage(accessJwt, imageData).catch((err) => {
        throw err;
      });
      if (blob) {
        embed = {
          $type: "app.bsky.embed.images",
          images: [
            {
              alt: text.slice(0, 100) || "image",
              image: blob,
            },
          ],
        };
      }
    }

    const record: any = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
    };
    if (embed) record.embed = embed;

    const postRes = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessJwt}`,
      },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.post",
        record,
      }),
    });

    if (!postRes.ok) {
      const detail = await postRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Post failed: ${postRes.status} ${detail}`.trim() },
        { status: 500 }
      );
    }

    const postJson = await postRes.json();
    const postUri = postJson?.uri;

    // Optional threadgate for reply controls
    const allow = buildAllow(replyControl, replyListUri);
    if (postUri && allow) {
      const rkey = postUri.split("/").pop();
      const gateRecord: any = {
        $type: "app.bsky.feed.threadgate",
        post: postUri,
        createdAt: new Date().toISOString(),
        allow,
      };
      await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessJwt}`,
        },
        body: JSON.stringify({
          repo: did,
          collection: "app.bsky.feed.threadgate",
          rkey,
          record: gateRecord,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
