# Email Configuration for Forgot Password

Password reset emails use **Resend** first, with **Gmail SMTP fallback** when Resend test mode blocks the recipient.

## Option 1: Resend (Production)

```env
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM=Company Portal <noreply@thecreativex.in>
```

Verify `thecreativex.in` at [resend.com/domains](https://resend.com/domains) before using a custom domain sender.

## Option 2: Gmail SMTP Fallback (Development / No domain)

When Resend is in test mode, add these to `.env.local`:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=thecreativex.ca@gmail.com
EMAIL_PASS=your-16-char-gmail-app-password
EMAIL_FROM=Company Portal <thecreativex.ca@gmail.com>
```

### Gmail App Password setup

1. Enable 2-Step Verification on your Google Account
2. Go to Google Account → Security → App passwords
3. Create an app password for "Mail"
4. Paste the 16-character password as `EMAIL_PASS`

The app will automatically use SMTP when Resend cannot deliver to the recipient.

## Admin Account

The CEO/admin email is: **`thecreativex.ca@gmail.com`**

## Flow

Login → Forgot Password → Enter email → OTP emailed → Verify → New password → Login

## Security

- Never commit `.env.local` to git
- `RESEND_API_KEY` and `EMAIL_PASS` are server-only (never `NEXT_PUBLIC_*`)
- OTPs are never returned in API responses
