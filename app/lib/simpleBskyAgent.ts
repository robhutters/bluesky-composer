"use client";

type LoginParams = {
  identifier: string;
  password: string;
};

type RequestParams = Record<string, string | number | undefined>;

export class BskyAgent {
  private service: string;
  private session: { accessJwt: string } | null = null;

  public app: {
    bsky: {
      actor: {
        getProfile: (params: { actor: string }) => Promise<{ data: any }>;
      };
      feed: {
        getPostThread: (params: { uri: string; depth?: number; parentHeight?: number }) => Promise<{ data: any }>;
        getAuthorFeed: (params: { actor: string; limit?: number; filter?: string }) => Promise<{ data: any }>;
      };
    };
  };

  constructor(opts: { service: string }) {
    this.service = opts.service.replace(/\/+$/, "");
    this.app = {
      bsky: {
        actor: {
          getProfile: (params) => this.xrpcGet("app.bsky.actor.getProfile", params),
        },
        feed: {
          getPostThread: (params) => this.xrpcGet("app.bsky.feed.getPostThread", params),
          getAuthorFeed: (params) => this.xrpcGet("app.bsky.feed.getAuthorFeed", params),
        },
      },
    };
  }

  async login({ identifier, password }: LoginParams) {
    const res = await fetch(`${this.service}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Login failed: ${res.status} ${detail}`.trim());
    }
    const data = await res.json();
    if (!data?.accessJwt) throw new Error("Missing Bluesky access token");
    this.session = { accessJwt: data.accessJwt };
    return data;
  }

  private async xrpcGet(endpoint: string, params: RequestParams) {
    if (!this.session?.accessJwt) throw new Error("Bluesky login required");
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      qs.append(key, String(value));
    });
    const url = `${this.service}/xrpc/${endpoint}${qs.toString() ? `?${qs.toString()}` : ""}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.session.accessJwt}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${endpoint} failed: ${res.status} ${detail}`.trim());
    }
    const data = await res.json();
    return { data };
  }
}
