/**
 * WebAuthn helpers shared by register/login route handlers.
 *
 * RP (Relying Party) identity is derived from the request `Origin` so the
 * same code works for `localhost` dev, Netlify previews, and prod without
 * env juggling. WebAuthn requires:
 *   • rpID    = the eTLD+1 hostname (e.g. "intendfinance.com" or "localhost")
 *   • origin  = the full scheme://host[:port] string the browser sent
 */
export interface RpContext {
  rpName:  string;
  rpID:    string;
  origin:  string;
}

const RP_NAME = 'Intend';

export function rpFromRequest(req: Request): RpContext {
  // Trust the Origin header (browsers always set it on POST + WebAuthn).
  const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? '';
  if (!origin) throw new Error('Missing Origin header — cannot derive RP context.');

  let url: URL;
  try { url = new URL(origin); }
  catch { throw new Error(`Invalid Origin header: ${origin}`); }

  // Strip any subdomains for prod; localhost stays as-is.
  // For v0.5 we keep it simple — full hostname == rpID. Subdomain coverage
  // is a Phase-2 concern (we're single-domain on Netlify).
  const rpID = url.hostname;

  return { rpName: RP_NAME, rpID, origin: `${url.protocol}//${url.host}` };
}

/** base64url helpers for credential IDs over the wire. */
export function bytesToB64u(b: Uint8Array | ArrayBuffer): string {
  const arr = b instanceof Uint8Array ? b : new Uint8Array(b);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]!);
  return Buffer.from(bin, 'binary').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
