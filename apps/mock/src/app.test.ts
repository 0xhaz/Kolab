import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { authorFromUrl, createApp, newState, signWebhook } from './app.ts';

const url = 'https://www.tiktok.com/@siti.reviews/video/123';

describe('mock platform', () => {
  it('serves oEmbed for any post and 404s once deleted', async () => {
    const app = createApp();
    const ok = await request(app).get('/oembed').query({ url });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ author_name: 'siti.reviews', provider_name: 'TikTok' });
    await request(app).post('/posts/delete').send({ url });
    expect((await request(app).get('/oembed').query({ url })).status).toBe(404);
  });

  it('tracks parcels and marks them delivered', async () => {
    const app = createApp();
    expect((await request(app).get('/tracking/JNT123')).body.status).toBe('in_transit');
    await request(app).post('/tracking/JNT123/deliver');
    expect((await request(app).get('/tracking/JNT123')).body.status).toBe('delivered');
  });

  it('sends an HMAC-signed sale webhook', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const app = createApp(newState(), { apiWebhookUrl: 'http://api/webhooks', webhookSecret: 's3cret', fetchImpl });
    const res = await request(app).post('/store/orders').send({ voucher: 'KOLAB-ABC123' });
    expect(res.status).toBe(201);
    expect(res.body.webhook).toBe('sent');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const sig = (init.headers as Record<string, string>)['x-kolab-signature']!;
    const t = Number(/t=(\d+)/.exec(sig)![1]);
    expect(sig).toBe(signWebhook(init.body as string, 's3cret', t));
  });

  it('reset clears everything', async () => {
    const state = newState();
    const app = createApp(state);
    await request(app).get('/oembed').query({ url });
    await request(app).post('/reset');
    expect(state.posts.size).toBe(0);
  });

  it('parses handles from post URLs', () => {
    expect(authorFromUrl('https://www.youtube.com/@kak.ina/shorts/1')).toBe('kak.ina');
  });
});
