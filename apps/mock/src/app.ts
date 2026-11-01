/**
 * Mock platform server for the demo (techstacks §7): oEmbed for fake posts, courier tracking and a
 * store that sends signed sale webhooks. In-memory, resettable. The verifier calls it through the
 * same interface as the real oEmbed endpoints, so swapping in the real ones is a base-URL change.
 */
import { createHmac, randomUUID } from 'node:crypto';
import express, { type Express, type Request, type Response } from 'express';

export interface MockPost {
  url: string;
  author: string;
  caption: string;
  createdAt: string;
  deleted: boolean;
}
export interface MockParcel {
  ref: string;
  status: 'in_transit' | 'delivered';
  updatedAt: string;
}
export interface MockOrder {
  ref: string;
  voucher: string;
  amount: number;
  createdAt: string;
  webhook: 'sent' | 'failed' | 'skipped';
}

export interface MockState {
  posts: Map<string, MockPost>;
  parcels: Map<string, MockParcel>;
  orders: MockOrder[];
}

export const newState = (): MockState => ({ posts: new Map(), parcels: new Map(), orders: [] });

export interface MockOptions {
  apiWebhookUrl?: string;
  webhookSecret?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_CAPTION = 'Loving this! #ad #kolab';

/** `https://www.tiktok.com/@handle/video/123` → `handle`. */
export function authorFromUrl(url: string): string {
  const m = /@([A-Za-z0-9_.]+)/.exec(url);
  return m?.[1] ?? 'creator';
}

/** Same scheme the API verifies: `t=<unix>,v1=<hex hmac of "t.body">`. */
export function signWebhook(body: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

export function createApp(state: MockState = newState(), opts: MockOptions = {}): Express {
  const app = express();
  app.use(express.json());
  const fetchImpl = opts.fetchImpl ?? fetch;

  const getPost = (url: string): MockPost => {
    let post = state.posts.get(url);
    if (!post) {
      post = { url, author: authorFromUrl(url), caption: DEFAULT_CAPTION, createdAt: new Date().toISOString(), deleted: false };
      state.posts.set(url, post);
    }
    return post;
  };

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- posts (oEmbed-shaped)

  app.get('/oembed', (req: Request, res: Response) => {
    const url = String(req.query.url ?? '');
    if (!url) return void res.status(400).json({ error: 'url required' });
    const post = getPost(url);
    if (post.deleted) return void res.status(404).json({ error: 'not found' });
    res.json({
      version: '1.0',
      type: 'video',
      provider_name: url.includes('youtube') ? 'YouTube' : 'TikTok',
      title: post.caption,
      author_name: post.author,
      author_url: `https://www.tiktok.com/@${post.author}`,
      html: `<blockquote data-url="${url}">${post.caption}</blockquote>`,
      thumbnail_url: 'https://placehold.co/540x960',
      // mock-only extension: real platforms expose this via their own APIs
      kolab_created_at: post.createdAt,
    });
  });

  /** Demo panel: set a caption (e.g. drop the #ad to fail the disclosure check). */
  app.post('/posts', (req, res) => {
    const { url, caption } = req.body as { url?: string; caption?: string };
    if (!url) return void res.status(400).json({ error: 'url required' });
    const post = getPost(url);
    if (caption) post.caption = caption;
    res.json(post);
  });

  /** Demo panel: "Delete creator post" → oEmbed 404 → still-live check fails. */
  app.post('/posts/delete', (req, res) => {
    const { url } = req.body as { url?: string };
    if (!url) return void res.status(400).json({ error: 'url required' });
    const post = getPost(url);
    post.deleted = true;
    res.json(post);
  });

  app.get('/posts', (_req, res) => {
    res.json([...state.posts.values()]);
  });

  // ---------------------------------------------------------------- courier tracking

  app.get('/tracking/:ref', (req, res) => {
    const ref = req.params.ref;
    let parcel = state.parcels.get(ref);
    if (!parcel) {
      parcel = { ref, status: 'in_transit', updatedAt: new Date().toISOString() };
      state.parcels.set(ref, parcel);
    }
    res.json(parcel);
  });

  app.post('/tracking/:ref/deliver', (req, res) => {
    const ref = req.params.ref;
    const parcel: MockParcel = { ref, status: 'delivered', updatedAt: new Date().toISOString() };
    state.parcels.set(ref, parcel);
    res.json(parcel);
  });

  // ---------------------------------------------------------------- store

  /** Creates an order with a creator's voucher code and notifies the API (HMAC-signed). */
  app.post('/store/orders', async (req, res) => {
    const { voucher, amount } = req.body as { voucher?: string; amount?: number };
    if (!voucher) return void res.status(400).json({ error: 'voucher required' });
    const order: MockOrder = {
      ref: `ORD-${randomUUID().slice(0, 8).toUpperCase()}`,
      voucher,
      amount: amount ?? 49.9,
      createdAt: new Date().toISOString(),
      webhook: 'skipped',
    };
    state.orders.push(order);

    if (opts.apiWebhookUrl && opts.webhookSecret) {
      const body = JSON.stringify({ orderRef: order.ref, voucher: order.voucher, amount: order.amount });
      try {
        const r = await fetchImpl(opts.apiWebhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-kolab-signature': signWebhook(body, opts.webhookSecret) },
          body,
        });
        order.webhook = r.ok ? 'sent' : 'failed';
      } catch {
        order.webhook = 'failed';
      }
    }
    res.status(201).json(order);
  });

  app.get('/store/orders', (_req, res) => {
    res.json(state.orders);
  });

  app.post('/reset', (_req, res) => {
    state.posts.clear();
    state.parcels.clear();
    state.orders.length = 0;
    res.json({ ok: true });
  });

  return app;
}
