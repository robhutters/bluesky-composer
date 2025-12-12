import { NextResponse } from "next/server";
import { buildAllow } from "@/app/lib/threadgate";

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

export async function POST(req: Request) {
  try {
    const { identifier, appPassword, posts, replyControl, replyListUri } = await req.json();
    if (!identifier || !appPassword || !Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json({ error: "Missing credentials or posts" }, { status: 400 });
    }
    const hasGif = posts.some((p: any) =>
      Array.isArray(p?.images)
        ? p.images.some((img: any) => {
            const data = typeof img === "string" ? img : img?.data;
            return typeof data === "string" && data.startsWith("data:image/gif");
          })
        : typeof p?.imageData === "string" && p.imageData.startsWith("data:image/gif")
    );
    if (hasGif) {
      return NextResponse.json(
        { error: "Animated GIFs are not supported for posting right now. Please use static images in the thread." },
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

    let root: { uri: string; cid: string } | null = null;
    let parent: { uri: string; cid: string } | null = null;

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const text = typeof post?.text === "string" ? post.text : "";
      const imgArray: { data: string; alt?: string }[] = Array.isArray(post?.images)
        ? post.images
            .map(
              (img: any): { data: string; alt?: string } | null =>
                typeof img === "string"
                  ? { data: img, alt: undefined }
                  : typeof img?.data === "string"
                    ? { data: img.data, alt: img?.alt }
                    : null
            )
            .filter(
              (img: { data: string; alt?: string } | null): img is { data: string; alt?: string } =>
                !!img && typeof img.data === "string"
            )
            .slice(0, 4)
        : post?.imageData
          ? [{ data: post.imageData, alt: undefined }]
          : [];
      if (!text) continue;

      let embed: any = undefined;
      if (imgArray.length) {
        const uploads = [];
        for (const img of imgArray.slice(0, 4)) {
          const blob = await uploadImage(accessJwt, img.data);
          if (blob) uploads.push({ blob, alt: img.alt });
        }
        if (uploads.length) {
          embed = {
            $type: "app.bsky.embed.images",
            images: uploads.map((item, idx) => ({
              alt: item.alt || text.slice(0, 100) || `image-${idx + 1}`,
              image: item.blob,
            })),
          };
        }
      }

      const record: any = {
        $type: "app.bsky.feed.post",
        text,
        createdAt: new Date().toISOString(),
      };
      if (embed) record.embed = embed;
      if (root && parent) {
        record.reply = {
          root,
          parent,
        };
      }

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

      const json = await postRes.json();
      const uri = json?.uri;
      const cid = json?.cid;
      if (uri && cid) {
        if (!root) root = { uri, cid };
        parent = { uri, cid };
      }
    }

    // Create threadgate for reply controls when requested
    if (root && replyControl && replyControl !== "anyone") {
      const allow = buildAllow(replyControl, replyListUri);
      if (replyControl === "list" && (!replyListUri || !allow)) {
        return NextResponse.json({ error: "List reply rule requires a list AT-URI" }, { status: 400 });
      }
      if (allow === null) {
        return NextResponse.json({ error: "Invalid reply control" }, { status: 400 });
      }
      const rkey = root.uri.split("/").pop();
      const gateRecord = {
        $type: "app.bsky.feed.threadgate",
        post: root.uri,
        createdAt: new Date().toISOString(),
        allow,
      };
      const gateRes = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
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
      });
      if (!gateRes.ok) {
        const detail = await gateRes.text().catch(() => "");
        return NextResponse.json(
          { error: `Threadgate failed: ${gateRes.status} ${detail}`.trim() },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
