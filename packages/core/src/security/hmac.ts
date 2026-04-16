/**
 * Shared HMAC verification utility
 *
 * Used by: Telegram webhook, WhatsApp webhook
 * Uses timing-safe comparison to prevent timing attacks.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify a Telegram webhook request.
 * Telegram sends the secret token as X-Telegram-Bot-Api-Secret-Token header.
 * Value must match TELEGRAM_WEBHOOK_SECRET exactly.
 */
export function verifyTelegramWebhook(
  secret: string,
  headerValue: string | undefined,
): boolean {
  if (!headerValue) return false;
  try {
    return timingSafeEqual(
      Buffer.from(headerValue),
      Buffer.from(secret),
    );
  } catch {
    return false;
  }
}

/**
 * Verify a WhatsApp Cloud API webhook request.
 * Meta sends X-Hub-Signature-256: sha256=<hex>
 * Computed as HMAC-SHA256(WHATSAPP_WEBHOOK_SECRET, rawBody).
 */
export function verifyWhatsAppWebhook(
  secret: string,
  signature: string | undefined,
  rawBody: string,
): boolean {
  if (!signature) return false;
  try {
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

/**
 * Generic HMAC-SHA256 signature for any payload.
 * Used for internal service-to-service calls.
 */
export function signPayload(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
