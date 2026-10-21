# Safi360 Production Readiness Checklist

## 🚀 Current Status
- ✅ **Signup flow working**: `/signup` → OTP verification → company details → trial creation
- ✅ **Plan selection**: `/onboarding/plan` → select plan → activate subscription
- ✅ **Subscription gating**: Trial (7 days) → expired → blocked with payment link
- ✅ **Demo tenant**: `usafi-bora` (seeded in development only)
- ✅ **Landing page**: Updated with signup CTAs

---

## 🔴 Critical: Must Fix Before Production Launch

### 1. **Database & Migrations**
| Item | Status | Action Required |
|------|--------|-----------------|
| Production seed data | ❌ | Remove demo tenants from `seed.sql` - create separate production seed with only plans |
| RLS policies | ✅ | Verified in migrations 0004, 0005, 0006 |
| Custom access token hook | ✅ | Migration 0005 adds tenant claims to JWT |
| Plan pricing | ⚠️ | Update plan prices in production DB (currently TZS 45k/95k/180k) |
| Indexes | ✅ | Created in migrations |

### 2. **Supabase Configuration (Production Project)**
| Setting | Required Value |
|---------|----------------|
| **Auth → Providers → Phone** | Enable SMS provider (Twilio/MessageBird) |
| **Auth → SMS Template** | Custom OTP template with brand name |
| **Auth → Site URL** | `https://safi360.vercel.app` |
| **Auth → Redirect URLs** | `https://safi360.vercel.app/**`, `https://safi360.vercel.app/ops/**`, etc. |
| **Database → Connection Pooling** | Enable for production |
| **Edge Functions** | Deploy all functions (`supabase functions deploy`) |
| **Secrets** | Set in Supabase Dashboard: `SELCOM_VENDOR_ID`, `SELCOM_API_KEY`, `SELCOM_SECRET_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_WABA_ID`, etc. |

### 3. **Environment Variables (Vercel Production)**
| Variable | Source |
|----------|--------|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API |
| `VITE_APP_ENV` | `production` |
| `VITE_DEFAULT_LOCALE` | `sw` |
| `VITE_TIMEZONE` | `Africa/Dar_es_Salaam` |

### 4. **Payment Integration (snippe.me/pay/safi360)**
- [ ] Verify payment page works with production webhook
- [ ] Configure webhook URL in snippe.me to call Supabase Edge Function
- [ ] Add webhook secret to Supabase secrets
- [ ] Create Edge Function to handle payment callbacks → update tenant status/plan
- [ ] Test full flow: trial expired → payment → plan activated

### 5. **SMS/OTP Provider**
- [ ] Production Twilio/MessageBird account
- [ ] Verify sender ID registration for Tanzania (+255)
- [ ] Update `supabase/config.toml` test OTP map → remove test numbers
- [ ] Set SMS provider credentials in Supabase secrets

### 6. **WhatsApp Business API**
- [ ] Meta Business Verification
- [ ] WhatsApp Business Account (WABA) setup
- [ ] Template approval for notifications
- [ ] Configure in `tenant_integrations` per tenant

### 7. **Mobile Money (Selcom/AzamPesa)**
- [ ] Production merchant accounts
- [ ] API credentials in Supabase secrets
- [ ] Webhook endpoints deployed and tested
- [ ] STK push / USSD flow tested

---

## 🟡 Important: Should Fix Before Launch

### 8. **Email & Transactional**
- [ ] Configure SMTP (SendGrid/Resend) in Supabase
- [ ] Email templates for: welcome, password reset, invoice receipts
- [ ] Verify domain authentication (SPF/DKIM/DMARC)

### 9. **Domain & SSL**
- [ ] Custom domain: `safi360.co.tz` or similar
- [ ] Vercel custom domain configuration
- [ ] SSL certificate (automatic via Vercel)
- [ ] DNS records: A/AAAA + CNAME for www

### 10. **Monitoring & Error Tracking**
- [ ] Sentry DSN in `VITE_SENTRY_DSN` (currently optional)
- [ ] Vercel Analytics enabled
- [ ] Supabase Logs & Metrics monitoring
- [ ] Uptime monitoring (Better Uptime / Pingdom)

### 11. **Legal & Compliance**
- [ ] Privacy Policy at `/privacy` (currently placeholder)
- [ ] Terms of Service
- [ ] Data Processing Agreement (DPA) for Tanzanian data laws
- [ ] Cookie consent banner (if using analytics)
- [ ] Business registration (BRELA) displayed in footer

### 12. **SEO & Marketing**
- [ ] `robots.txt` allowing crawlers
- [ ] `sitemap.xml` generation
- [ ] Open Graph / Twitter Card meta tags
- [ ] Google Search Console verification
- [ ] Landing page performance optimization

---

## 🟢 Nice to Have: Post-Launch

### 13. **Feature Flags & Settings**
- [ ] Feature flag system for gradual rollout
- [ ] Per-tenant feature toggles in `tenant.settings`
- [ ] A/B testing framework for pricing page

### 14. **Operational Tooling**
- [ ] Admin dashboard for super admins (Control panel)
- [ ] Tenant impersonation for support
- [ ] Audit log viewer
- [ ] Database backup schedule (Supabase automated + manual)

### 15. **Internationalization**
- [ ] English translations complete (✅ mostly done)
- [ ] Currency formatting for other EAC countries (future)
- [ ] Timezone support beyond Africa/Dar_es_Salaam

---

## 📋 Pre-Launch Testing Checklist

### Manual Testing Flows
- [ ] **New user signup**: Phone → OTP → Company details → Plan select → Dashboard access
- [ ] **Existing user login**: Phone → OTP → Dashboard
- [ ] **Trial expiry**: Wait 7 days (or change `trial_ends_at`) → Blocked → Payment → Access restored
- [ ] **Customer booking**: Portal → Book → OTP → Confirm → Dashboard shows ticket
- [ ] **Dispatch**: Assign cleaner → Cleaner gets job → Complete with photos
- [ ] **Payment flow**: Deposit → Success → Balance on completion
- [ ] **Notifications**: SMS/WhatsApp sent at each stage
- [ ] **Multi-tenant isolation**: Tenant A cannot see Tenant B data

### Load Testing
- [ ] 100 concurrent bookings
- [ ] 500 active cleaners
- [ ] 1000 daily reminders

### Security Testing
- [ ] SQL injection attempts on all inputs
- [ ] XSS in user-generated content
- [ ] RLS bypass attempts
- [ ] JWT token tampering
- [ ] Rate limiting on auth endpoints

---

## 🗂️ Files to Review/Update for Production

| File | Purpose |
|------|---------|
| `supabase/seed.sql` | **Remove demo data**, keep only plans |
| `supabase/config.toml` | Remove test OTP numbers, update `site_url` |
| `vercel.json` | Verify rewrites/headers for production |
| `.env.example` | Document all required env vars |
| `src/lib/env.ts` | Validate all production env vars |
| `src/lib/subscription.ts` | Payment URL constant |
| `src/components/shared/SubscriptionGate.tsx` | Payment URL, trial days |
| `src/experiences/landing/LandingPage.tsx` | Update pricing if changed |

---

## 💰 Cost Estimates (Monthly)

| Service | Est. Cost |
|---------|-----------|
| Supabase Pro | $25/mo |
| Vercel Pro | $20/mo |
| Twilio SMS (TZ) | ~$0.03/SMS × volume |
| WhatsApp Business | Conversation-based pricing |
| Selcom/AzamPesa | Transaction fees |
| SendGrid Email | $15/mo (100k emails) |
| Sentry | $26/mo (100k events) |
| **Total (est.)** | **$100-300/mo** depending on volume |

---

## 🚨 Go/No-Go Decision

**Ready for soft launch when:**
- [ ] All Critical (🔴) items complete
- [ ] Payment flow end-to-end tested
- [ ] SMS OTP working on real Tanzanian numbers
- [ ] At least 1 pilot company onboarded manually
- [ ] Monitoring alerts configured

**Ready for public launch when:**
- [ ] All Important (🟡) items complete
- [ ] Legal docs published
- [ ] Custom domain live
- [ ] Load testing passed
- [ ] Support process documented

---

## 📞 Support Contacts

| Area | Contact |
|------|---------|
| Supabase | Dashboard → Support |
| Vercel | Dashboard → Support |
| Twilio | Account Manager |
| Selcom/AzamPesa | Business support |
| Legal | Local Tanzanian counsel |

---

*Last updated: 2026-10-21*
*Version: 1.0*