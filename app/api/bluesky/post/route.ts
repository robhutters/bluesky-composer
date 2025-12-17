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

async function uploadBlob(accessJwt: string, dataUrl?: string | null) {
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
    throw new Error(`Upload failed: ${res.status} ${detail}`.trim());
  }
  const json = await res.json();
  return json?.blob || null;
}

async function uploadVideo(accessJwt: string, video: { buffer: Buffer; mime?: string }) {
  const body = new Uint8Array(video.buffer);
  const res = await fetch("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", {
    method: "POST",
    headers: {
      "Content-Type": video.mime || "video/mp4",
      Authorization: `Bearer ${accessJwt}`,
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Video upload failed: ${res.status} ${detail}`.trim());
  }
  const json = await res.json();
  console.log("[video] uploaded via uploadBlob");
  return json?.blob;
}

export async function POST(req: Request) {
  try {
    const {
      identifier,
      appPassword,
      text,
      images,
      video,
      replyControl,
      replyListUri,
      replyTarget,
    } = await req.json();
    if (!identifier || !appPassword) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }
    const normalizedText = typeof text === "string" ? text : "";
    const videoBuffer =
      video?.bytes && Array.isArray(video.bytes)
        ? Buffer.from(video.bytes)
        : null;
    const videoData = video && videoBuffer
      ? {
          buffer: videoBuffer,
          alt: typeof video.alt === "string" ? video.alt : "",
          width: video.width,
          height: video.height,
          size: video.size,
          mime: video.mime || "video/mp4",
        }
      : null;
    if (videoData?.buffer && videoData.buffer.length > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Video too large (limit 50MB)" }, { status: 400 });
    }
    const imageArray: { data: string; alt?: string; width?: number; height?: number }[] = Array.isArray(images)
      ? images
          .map(
            (img: any): { data: string; alt?: string; width?: number; height?: number } | null =>
              typeof img === "string"
                ? { data: img, alt: undefined }
                : typeof img?.data === "string"
                  ? { data: img.data, alt: img?.alt, width: img?.width, height: img?.height }
                  : null
          )
          .filter(
            (
              img: { data: string; alt?: string; width?: number; height?: number } | null
            ): img is { data: string; alt?: string; width?: number; height?: number } =>
              !!img && typeof img.data === "string"
          )
          .slice(0, 4)
      : [];
    if (!videoData && imageArray.some((img) => img.data.startsWith("data:image/gif"))) {
      return NextResponse.json(
        { error: "Animated GIFs are not supported for posting right now. Please use static images." },
        { status: 400 }
      );
    }

    const hasText = normalizedText.trim().length > 0;
    const hasMedia = imageArray.length > 0 || !!videoData?.buffer;
    if (!hasText && !hasMedia) {
      return NextResponse.json(
        { error: "Add text or at least one image/video before posting." },
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
    if (videoData?.buffer) {
      const blob = await uploadVideo(accessJwt, videoData);
      if (blob) {
        embed = {
          $type: "app.bsky.embed.video",
          video: blob,
          alt: videoData.alt || "",
          aspectRatio:
            videoData.width && videoData.height
              ? { width: videoData.width, height: videoData.height }
              : undefined,
        };
      }
    } else if (imageArray.length) {
      const uploads = [];
      for (const img of imageArray.slice(0, 4)) {
        const blob = await uploadBlob(accessJwt, img.data);
        if (blob) uploads.push({ blob, alt: img.alt });
      }
      if (uploads.length) {
        embed = {
          $type: "app.bsky.embed.images",
          images: uploads.map((item, idx) => ({
            alt: item.alt || text.slice(0, 100) || `image-${idx + 1}`,
            image: item.blob,
            aspectRatio:
              typeof imageArray[idx]?.width === "number" && typeof imageArray[idx]?.height === "number"
                ? { width: imageArray[idx]!.width as number, height: imageArray[idx]!.height as number }
                : undefined,
          })),
        };
      }
    }

    const record: any = {
      $type: "app.bsky.feed.post",
      text: normalizedText,
      createdAt: new Date().toISOString(),
    };
    if (replyTarget?.uri && replyTarget?.cid) {
      record.reply = {
        root: { uri: replyTarget.uri, cid: replyTarget.cid },
        parent: { uri: replyTarget.uri, cid: replyTarget.cid },
      };
    }
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
    if (replyControl === "list" && !allow) {
      return NextResponse.json({ error: "List reply rule requires a list AT-URI" }, { status: 400 });
    }
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
