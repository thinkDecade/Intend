'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getUserByEmail, createUser } from '@intend/data';

// ── Supabase admin client (service role — bypasses RLS, generates OTP links) ──
function getAdminClient() {
  return createAdminClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  );
}

// ── Resend client ─────────────────────────────────────────────────────────────
function getResend() {
  return new Resend(process.env['RESEND_API_KEY']);
}

export async function signInWithOtp(formData: FormData) {
  const email = formData.get('email') as string;
  if (!email?.trim()) return { error: 'Email is required.' };

  const siteUrl =
    process.env['NEXT_PUBLIC_SITE_URL'] ??
    (process.env['VERCEL_URL'] ? `https://${process.env['VERCEL_URL']}` : null) ??
    'http://localhost:3002';

  try {
    // Generate OTP + magic link via admin API without sending Supabase's built-in email.
    // This bypasses Supabase's rate-limited built-in mailer.
    const adminClient = getAdminClient();
    const { data, error: genError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${siteUrl}/auth/callback?next=/app` },
    });

    if (genError || !data?.properties?.email_otp) {
      // Fallback: try the standard OTP flow (may still hit rate limit on dev projects)
      console.warn('[signInWithOtp] admin.generateLink failed:', genError?.message, '— falling back to signInWithOtp');
      const cookieStore = await cookies();
      const supabase = createClient(cookieStore);
      const { error: fallbackErr } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: `${siteUrl}/auth/callback?next=/app` },
      });
      if (fallbackErr) return { error: fallbackErr.message };
      return { success: true };
    }

    const otp = data.properties.email_otp;  // 6-digit code
    const magicLink = data.properties.action_link;

    // Send branded email via Resend
    const resend = getResend();
    const { error: emailError } = await resend.emails.send({
      from:    'Intend <onboarding@resend.dev>',
      to:      email,
      subject: `${otp} — Your Intend sign-in code`,
      html: `
<!DOCTYPE html>
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
          <p style="margin:0 0 32px;font-size:15px;color:#7D6F62;line-height:1.6;">Use this code to sign in to Intend. It expires in 10 minutes.</p>
          <div style="background:#F5F0E6;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px;">
            <p style="margin:0;font-size:42px;font-weight:800;color:#D4A24A;letter-spacing:0.2em;font-family:'Courier New',monospace;">${otp}</p>
          </div>
          <p style="margin:0 0 16px;font-size:14px;color:#7D6F62;">Or sign in instantly with the link below:</p>
          <a href="${magicLink}" style="display:inline-block;background:#1A1612;color:#F5F0E6;text-decoration:none;padding:14px 28px;border-radius:100px;font-size:14px;font-weight:600;">Open Intend →</a>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #E0DACD;">
          <p style="margin:0;font-size:12px;color:#A0907E;">If you didn't request this, ignore it — your account is safe.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    if (emailError) {
      console.error('[signInWithOtp] Resend delivery failed:', emailError);
      return { error: 'Could not deliver the sign-in email. Please try again.' };
    }

    return { success: true };
  } catch (err) {
    console.error('[signInWithOtp] unexpected error:', err);
    return { error: 'Something went wrong. Please try again in a moment.' };
  }
}

export async function verifyOtp(formData: FormData) {
  const email = formData.get('email') as string;
  const token = formData.get('token') as string;

  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) return { error: error.message };

  // Ensure internal users table row exists after first OTP verification
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
      console.error('[verifyOtp] auto-create user failed:', err);
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
