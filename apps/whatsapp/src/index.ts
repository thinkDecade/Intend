/**
 * Intend WhatsApp Cloud API handler
 *
 * Webhook verification: X-Hub-Signature-256 HMAC on every request
 * GET  /webhook — Meta verification challenge (verify_token)
 * POST /webhook — Incoming message events
 *
 * PM2 process: intend-whatsapp
 * Full primitive support: P1-18
 */

import * as http from 'http';
import { verifyWhatsAppWebhook } from '@intend/core';
import { logEvent, getUserByWhatsAppId } from '@intend/data';

const VERIFY_TOKEN = process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'];
const WEBHOOK_SECRET = process.env['WHATSAPP_WEBHOOK_SECRET'];
const PORT = parseInt(process.env['WHATSAPP_PORT'] ?? '3002', 10);

if (!VERIFY_TOKEN)   throw new Error('[intend-whatsapp] WHATSAPP_WEBHOOK_VERIFY_TOKEN is required');
if (!WEBHOOK_SECRET) throw new Error('[intend-whatsapp] WHATSAPP_WEBHOOK_SECRET is required');

// ── WhatsApp message types ────────────────────────────────────────────────

interface WhatsAppTextMessage {
  from: string;       // phone number in E.164
  id:   string;       // message ID
  type: 'text';
  text: { body: string };
  timestamp: string;
}

interface WhatsAppWebhookEntry {
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { phone_number_id: string };
      contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      messages?: WhatsAppTextMessage[];
      statuses?: Array<{ id: string; status: string }>;
    };
  }>;
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

// ── Message handler ───────────────────────────────────────────────────────

async function handleMessage(msg: WhatsAppTextMessage): Promise<void> {
  const waId = msg.from;
  const text = msg.type === 'text' ? msg.text.body : '';
  if (!text) return;

  const user = await getUserByWhatsAppId(waId);
  if (!user) {
    // New user via WhatsApp — auto-create is P1-18
    console.log(`[whatsapp] Unknown user: ${waId}`);
    return;
  }

  await logEvent({
    user_id:    user.user_id,
    event_type: 'intent_created',
    source:     'whatsapp',
    event_data: { message_id: msg.id, text },
  });

  // Full pipeline integration: P1-18
  // Architecture is identical to Telegram: normalize → interpretIntent → buildUFM → confirm
  console.log(`[whatsapp] Message from ${waId}: ${text.slice(0, 50)}`);
}

// ── HTTP server ───────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // GET — Meta webhook verification challenge
  if (req.method === 'GET' && url.pathname === '/webhook') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      res.writeHead(200).end(challenge);
    } else {
      res.writeHead(403).end('Forbidden');
    }
    return;
  }

  // POST — Incoming webhook events
  if (req.method === 'POST' && url.pathname === '/webhook') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      // HMAC verification — mandatory on every request
      const sig = req.headers['x-hub-signature-256'] as string | undefined;
      if (!verifyWhatsAppWebhook(WEBHOOK_SECRET!, sig, body)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      res.writeHead(200).end('OK'); // Respond immediately — Meta requires < 20s

      try {
        const payload = JSON.parse(body) as WhatsAppWebhookPayload;
        if (payload.object !== 'whatsapp_business_account') return;

        for (const entry of payload.entry) {
          for (const change of entry.changes) {
            const messages = change.value.messages ?? [];
            for (const msg of messages) {
              handleMessage(msg).catch((err) =>
                console.error('[whatsapp] Message handler error:', err)
              );
            }
          }
        }
      } catch (err) {
        console.error('[whatsapp] Payload parse error:', err);
      }
    });
    return;
  }

  res.writeHead(404).end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[intend-whatsapp] Webhook server listening on port ${PORT}`);
});
