import { createApp, newState } from './app.ts';

const port = Number(process.env.PORT ?? 4100);
const app = createApp(newState(), {
  apiWebhookUrl: process.env.API_WEBHOOK_URL ?? 'http://localhost:4000/webhooks/store-sales',
  webhookSecret: process.env.STORE_WEBHOOK_SECRET,
});
app.listen(port, () => console.log(`Kolab mock platform on http://localhost:${port}`));
