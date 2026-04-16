/**
 * Visa Intelligent Commerce (VIC) — MCP Rail
 *
 * Implements the Trusted Agent SPEND flow via Visa's MCP server.
 * Auth: JWE token (your RSA key signs a JWT, encrypted with Visa's public key from JWKS).
 * Transport: StreamableHTTPClientTransport from @modelcontextprotocol/sdk.
 *
 * Flow:
 *   1. enroll-card              → enrol the payment card, get enrollment reference ID
 *   2. initiate-purchase-instruction → create a purchase mandate, get instructionId
 *   3. get-transaction-credentials   → retrieve payment credentials for the tx
 *   4. confirm-transaction-events    → signal completion back to Visa
 *
 * Security rules (CLAUDE.md):
 *   - Store vault_token_id only — NEVER card data, NEVER card numbers
 *   - All SPEND requires explicit user confirmation — no automation exception
 *   - Re-validate invoice at execution time, not just confirmation time
 */

import { CompactEncrypt, importPKCS8, importX509, SignJWT } from 'jose';
import type { CompactJWEHeaderParameters, JWK } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// ── Env helpers ──────────────────────────────────────────────────────────────

function env(key: string, required = true): string {
  const val = process.env[key];
  if (required && !val) throw new Error(`[visa-mcp] Missing env var: ${key}`);
  return val ?? '';
}

// ── JWE Token Generation (mirrors @visa/token-manager) ───────────────────────

interface VisaCredentials {
  vicApiKey:            string;
  vicApiKeySharedSecret: string;
  vtsApiKey:            string;
  vtsApiKeySharedSecret: string;
  mleServerCert:        string;
  mlePrivateKey:        string;
  externalClientId:     string;
  externalAppId:        string;
  keyId:                string;
  baseUrl:              string;
  authorization?:       string;
  relationshipId?:      string;
}

function loadCredentials(): VisaCredentials {
  const base: VisaCredentials = {
    vicApiKey:             env('VISA_VIC_API_KEY'),
    vicApiKeySharedSecret: env('VISA_VIC_API_KEY_SS'),
    vtsApiKey:             env('VISA_VTS_API_KEY'),
    vtsApiKeySharedSecret: env('VISA_VTS_API_KEY_SS'),
    mleServerCert:         env('VISA_MLE_SERVER_CERT'),
    mlePrivateKey:         env('VISA_MLE_PRIVATE_KEY'),
    externalClientId:      env('VISA_EXTERNAL_CLIENT_ID'),
    externalAppId:         env('VISA_EXTERNAL_APP_ID'),
    keyId:                 env('VISA_KEY_ID'),
    baseUrl:               env('VISA_MCP_BASE_URL'),
  };
  const auth = env('VISA_AUTHORIZATION', false);
  const rel  = env('VISA_RELATIONSHIP_ID', false);
  if (auth) base.authorization  = auth;
  if (rel)  base.relationshipId = rel;
  return base;
}

async function fetchVisaPublicKey(baseUrl: string): Promise<JWK> {
  const res = await fetch(`${baseUrl}/.well-known/jwks`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`[visa-mcp] JWKS fetch failed: ${res.status}`);
  const jwks = await res.json() as { keys?: JWK[] };
  const key = jwks.keys?.[0];
  if (!key?.n || !key?.e) throw new Error('[visa-mcp] JWKS key missing RSA modulus/exponent');
  if (!key?.x5c?.length) throw new Error('[visa-mcp] JWKS key missing x5c chain');
  return key;
}

async function generateJweToken(creds: VisaCredentials): Promise<{ token: string; expiresAt: Date }> {
  const jwksKey = await fetchVisaPublicKey(creds.baseUrl);
  const raw = jwksKey.x5c![0]!;
  const wrapped = raw.replace(/[\r\n\s]/g, '').match(/.{1,64}/g)?.join('\n') ?? raw;
  const pem = `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`;
  const publicKey = await importX509(pem, 'RSA-OAEP-256');

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const payload = {
    vdp_vic_apikey:          creds.vicApiKey,
    vdp_vic_apikey_ss:       creds.vicApiKeySharedSecret,
    vdp_vts_apikey:          creds.vtsApiKey,
    vdp_vts_apikey_ss:       creds.vtsApiKeySharedSecret,
    mle_server_cert_value:   creds.mleServerCert,
    mle_private_key_value:   creds.mlePrivateKey,
    mle_key_id:              creds.keyId,
    external_client_id:      creds.externalClientId,
    external_app_id:         creds.externalAppId,
    ...(creds.authorization  && { authorization:   creds.authorization  }),
    ...(creds.relationshipId && { relationship_id: creds.relationshipId }),
    iat: now,
    exp,
    iss: creds.baseUrl,
    aud: creds.baseUrl,
    jti: `intend-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };

  const signingKey = env('USER_SIGNING_PRIVATE_KEY');
  const privateKey = await importPKCS8(signingKey, 'RS256');
  const jws = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(privateKey);

  const header: CompactJWEHeaderParameters = {
    alg: 'RSA-OAEP-256',
    enc: 'A256GCM',
    x5c: [raw],
    kid: creds.keyId,
    typ: 'JWT',
  };

  const jwe = await new CompactEncrypt(new TextEncoder().encode(jws))
    .setProtectedHeader(header)
    .encrypt(publicKey);

  return { token: jwe, expiresAt: new Date(exp * 1000) };
}

// ── Token cache ───────────────────────────────────────────────────────────────

let _cachedToken: { token: string; expiresAt: Date } | null = null;

async function getToken(): Promise<string> {
  const REFRESH_MARGIN_MS = 60_000; // refresh 60s before expiry
  if (_cachedToken && _cachedToken.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return _cachedToken.token;
  }
  _cachedToken = await generateJweToken(loadCredentials());
  return _cachedToken.token;
}

// ── MCP client factory ────────────────────────────────────────────────────────

async function createMcpClient(): Promise<Client> {
  const baseUrl = env('VISA_MCP_BASE_URL');
  const token   = await getToken();

  const client = new Client({ name: 'intend-agent', version: '0.5.0' });
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
  );

  await client.connect(transport as Transport);
  return client;
}

async function callTool<T>(client: Client, toolName: string, args: Record<string, unknown>): Promise<T> {
  const res = await client.callTool({ name: toolName, arguments: args });
  if (res.isError) throw new Error(`[visa-mcp] Tool error: ${JSON.stringify(res)}`);

  const content = (res.content as Array<{ type: string; text?: string }>)[0];
  if (content?.type === 'text' && content.text) {
    try { return JSON.parse(content.text) as T; } catch { return content.text as T; }
  }
  return res as T;
}

// ── Public SPEND types ────────────────────────────────────────────────────────

export interface VisaSpendParams {
  consumer_id:           string;   // VISA_CONSUMER_ID
  enrollment_ref_id:     string;   // stored vault_token_id from prior enrollment
  amount_usd:            number;
  merchant_name:         string;
  merchant_category:     string;   // MCC code or category string
  transaction_ref_id:    string;   // your unique tx reference (UUID)
}

export interface VisaSpendResult {
  instruction_id:         string;
  authorization:          string;
  signed_payload:         string;
  transaction_ref_id:     string;
  status:                 string;
}

export interface VisaEnrollResult {
  enrollment_ref_id: string;   // store this as vault_token_id — never card data
  status:            string;
}

// ── Step 1: Enroll card (first time only) ─────────────────────────────────────

/**
 * Enroll a payment card with Visa VTS.
 * Returns enrollment_ref_id — store this, never the card data itself.
 * Only call on first-time card setup or re-enrollment.
 */
export async function enrollCard(consumerId: string): Promise<VisaEnrollResult> {
  const client = await createMcpClient();
  try {
    const res = await callTool<{ data: { enrollmentReferenceId: string; status: string } }>(
      client,
      'enroll-card',
      {
        consumerId,
        tokenRequestorId:    env('VISA_TR_ID',          false) || undefined,
        tokenRequestorAppId: env('VISA_TR_APPID',       false) || undefined,
      },
    );
    return {
      enrollment_ref_id: res.data.enrollmentReferenceId,
      status:            res.data.status,
    };
  } finally {
    await client.close();
  }
}

// ── Steps 2–4: Execute a SPEND ────────────────────────────────────────────────

/**
 * Execute a Visa Intelligent Commerce payment.
 * Requires an enrollment_ref_id from a prior enrollCard() call.
 *
 * Runs:
 *   initiate-purchase-instruction → get instructionId
 *   get-transaction-credentials   → get authorization + signed payload
 *   confirm-transaction-events    → signal completion to Visa
 */
export async function executeVisaSpend(params: VisaSpendParams): Promise<VisaSpendResult> {
  const client = await createMcpClient();
  try {
    // Step 2: Initiate purchase instruction
    const initiateRes = await callTool<{
      data: { instructionId: string; clientReferenceId: string; status: string };
    }>(client, 'initiate-purchase-instruction', {
      consumerId:           params.consumer_id,
      tokenId:              params.enrollment_ref_id,
      clientReferenceId:    params.transaction_ref_id,
      transactionAmount:    params.amount_usd.toFixed(2),
      transactionCurrency:  'USD',
      merchantName:         params.merchant_name,
      merchantCategoryCode: params.merchant_category,
    });

    const instructionId = initiateRes.data.instructionId;

    // Step 3: Retrieve payment credentials
    const credRes = await callTool<{
      data: {
        instructionId: string;
        status: string;
        authorization?: string;
        signedPayload?:  string;
      };
    }>(client, 'get-transaction-credentials', {
      instructionId,
      tokenId:               params.enrollment_ref_id,
      transactionReferenceId: params.transaction_ref_id,
    });

    // Step 4: Confirm transaction events
    await callTool(client, 'confirm-transaction-events', {
      instructionId,
      transactionReferenceId: params.transaction_ref_id,
      status: 'APPROVED',
    });

    return {
      instruction_id:      instructionId,
      authorization:       credRes.data.authorization ?? '',
      signed_payload:      credRes.data.signedPayload  ?? '',
      transaction_ref_id:  params.transaction_ref_id,
      status:              credRes.data.status,
    };
  } finally {
    await client.close();
  }
}
