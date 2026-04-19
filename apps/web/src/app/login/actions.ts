'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getUserByEmail, createUser } from '@intend/data';

// ── Supabase admin client ─────────────────────────────────────────────────────
function getAdminClient() {
  return createAdminClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  );
}

// ── Site URL helper ───────────────────────────────────────────────────────────
function getSiteUrl() {
  return (
    process.env['NEXT_PUBLIC_SITE_URL'] ??
    (process.env['VERCEL_URL'] ? `https://${process.env['VERCEL_URL']}` : null) ??
    'http://localhost:3002'
  );
}

// ── Branded email HTML ────────────────────────────────────────────────────────
// OTP-only email. The magic-link button was dropped because admin.generateLink
// can't issue PKCE links (no client-side code_verifier), and implicit-flow
// fragments require a client-side bounce that isn't worth the surface. The
// 6-digit OTP is the canonical entry path; users type it back into /login.
function buildEmailHtml(otp: string | null | undefined) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F0E6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E6;padding:48px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:#D4A24A;padding:32px 40px;">
          <p style="margin:0;font-size:18px;font-weight:800;color:#1A1612;letter-spacing:-0.03em;font-style:italic;">intend</p>
        </td></tr>
        <tr><td style="padding:40px 40px 32px;">
          <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#1A1612;letter-spacing:-0.03em;">Your sign-in code</h1>
          <p style="margin:0 0 32px;font-size:15px;color:#7D6F62;line-height:1.6;">Enter this code on the sign-in page. It expires in 10 minutes.</p>
          ${otp ? `
          <div style="background:#F5F0E6;border-radius:12px;padding:24px;text-align:center;">
            <p style="margin:0;font-size:42px;font-weight:800;color:#D4A24A;letter-spacing:0.2em;font-family:'Courier New',monospace;">${otp}</p>
          </div>` : ''}
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #E0DACD;">
          <p style="margin:0;font-size:12px;color:#A0907E;">If you didn't request this, ignore it — your account is safe.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// signInWithOtp
// ─────────────────────────────────────────────────────────────────────────────
//
// Two completely separate paths — they NEVER both run for the same request:
//
// PATH A (preferred): RESEND_API_KEY is set
//   1. admin.generateLink → creates OTP in Supabase WITHOUT triggering Supabase email
//   2. Send branded email via Resend
//   3. Never touch signInWithOtp (avoids double-request rate limit error)
//
// PATH B (fallback): RESEND_API_KEY is not set
//   1. signInWithOtp → Supabase sends its own email
//   2. Never touch admin.generateLink
//
export async function signInWithOtp(formData: FormData) {
  const email = formData.get('email') as string;
  if (!email?.trim()) return { error: 'Email is required.' };

  const siteUrl   = getSiteUrl();
  const resendKey = process.env['RESEND_API_KEY'];

  try {
    // ── PATH A: Resend available ──────────────────────────────────────────
    if (resendKey) {
      const adminClient = getAdminClient();
      const { data, error: genError } = await adminClient.auth.admin.generateLink({
        type:    'magiclink',
        email,
        options: { redirectTo: `${siteUrl}/auth/callback` },
      });

      if (genError) {
        console.error('[signInWithOtp] PATH A: admin.generateLink failed:', genError.message);
        return { error: 'Could not generate sign-in link. Please try again.' };
      }

      const otp = data?.properties?.email_otp ?? null;

      // Determine from address — use custom domain if configured, else Resend sandbox
      const fromAddress = process.env['RESEND_FROM_EMAIL'] ?? 'Intend <onboarding@resend.dev>';

      const resend = new Resend(resendKey);
      const { error: emailError } = await resend.emails.send({
        from:    fromAddress,
        to:      email,
        subject: otp ? `${otp} — Your Intend sign-in code` : 'Your Intend sign-in link',
        html:    buildEmailHtml(otp),
      });

      if (!emailError) return { success: true };

      // Resend failed (likely sandbox mode / unverified domain).
      // Fall back to Supabase built-in email.
      // NOTE: admin.generateLink uses service-role and does NOT increment Supabase's
      // email rate limiter, so calling signInWithOtp here is safe.
      console.warn('[signInWithOtp] PATH A: Resend failed:', JSON.stringify(emailError), '— falling back to Supabase email');

      const cookieStoreFallback = await cookies();
      const supabaseFallback    = createClient(cookieStoreFallback);
      const { error: fallbackErr } = await supabaseFallback.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: `${siteUrl}/auth/callback` },
      });

      if (fallbackErr) {
        console.error('[signInWithOtp] Supabase fallback also failed:', fallbackErr.message);
        return { error: 'Could not send sign-in email. Please try again in a moment.' };
      }

      return { success: true };
    }

    // ── PATH B: No Resend key — use Supabase built-in email ──────────────
    console.warn('[signInWithOtp] PATH B: RESEND_API_KEY not set, using Supabase email');
    const cookieStore = await cookies();
    const supabase    = createClient(cookieStore);
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${siteUrl}/auth/callback` },
    });

    if (otpErr) {
      console.error('[signInWithOtp] PATH B: signInWithOtp failed:', otpErr.message);
      return { error: otpErr.message };
    }

    return { success: true };

  } catch (err) {
    console.error('[signInWithOtp] unexpected error:', err);
    return { error: 'Something went wrong. Please try again in a moment.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// verifyOtp
// ─────────────────────────────────────────────────────────────────────────────
//
// Tries both token types because the type depends on which path was used above:
//   PATH A (admin.generateLink magiclink) → type: 'magiclink' or 'email'
//   PATH B (signInWithOtp)               → type: 'email'
//
export async function verifyOtp(formData: FormData) {
  const email = formData.get('email') as string;
  const token = formData.get('token') as string;

  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);

  // Try email type first (PATH B and some PATH A configurations)
  let { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });

  // If email type fails, try magiclink type (PATH A with admin.generateLink)
  if (error) {
    const result = await supabase.auth.verifyOtp({ email, token, type: 'magiclink' });
    data  = result.data;
    error = result.error;
  }

  if (error) return { error: error.message };

  // Ensure internal users table row exists.
  // Onboarding now happens conversationally in the chat — all users go to /app.
  if (data.user?.email) {
    try {
      const existing = await getUserByEmail(data.user.email).catch(() => null);
      if (!existing) {
        await createUser({
          email:      data.user.email,
          webapp_uid: data.user.id,
        });
      }
    } catch (err) {
      console.error('[verifyOtp] user record error:', err);
    }
  }

  redirect('/app');
}

export async function signOut() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  await supabase.auth.signOut();
  redirect('/login');
}
