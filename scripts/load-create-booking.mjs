#!/usr/bin/env node
// Load test for the booking write path against a real stack (hosted or local).
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=... pnpm load:booking
//
// Proves two things under concurrency:
//   1. 50 parallel create_booking calls with distinct idempotency keys produce 50 distinct,
//      gap-free ticket numbers (the counter is locked FOR UPDATE inside create_booking_tx);
//   2. 50 parallel calls with ONE key produce exactly one ticket (idempotency under the
//      per-tenant advisory lock).
// Uses an inspection-priced service so no slot capacity gets in the way, and the Mock OTP
// (OTP_PROVIDER=mock on the functions) to obtain the booking verify token.

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const slug = process.env.LOAD_SLUG ?? 'usafi-bora';
const phone = process.env.LOAD_PHONE ?? '+255715990001';
const concurrency = Number(process.env.LOAD_N ?? 50);
const MOULD = '55550000-0000-4000-8000-000000000009';

if (!url || !anon) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or the VITE_ variants).');
  process.exit(2);
}

async function call(name, body) {
  const started = performance.now();
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json, ms: performance.now() - started };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function ticketNumber(ref) {
  return Number(ref.slice(-5));
}

const otp = await call('otp_send', { slug, phone, purpose: 'booking', locale: 'en' });
if (otp.status !== 200) {
  console.error('otp_send failed', otp.status, otp.body);
  process.exit(1);
}
const verify = await call('otp_verify', { slug, phone, purpose: 'booking', code: '123456' });
if (verify.status !== 200) {
  console.error('otp_verify failed (is OTP_PROVIDER=mock set on the functions?)', verify.status, verify.body);
  process.exit(1);
}
const token = verify.body.token;

const payload = (key) => ({
  slug,
  idempotency_key: key,
  verify_token: token,
  customer: { name: 'Load Test' },
  address: { area: 'Mbezi Beach' },
  items: [{ service_id: MOULD, qty: 1 }],
  slot: null,
  payment_mode: 'ON_COMPLETION',
  source: 'website',
  locale: 'en',
});

console.log(`→ ${concurrency} concurrent creates with distinct keys`);
const distinct = await Promise.all(
  Array.from({ length: concurrency }, () =>
    call('create_booking', payload(`booking_${crypto.randomUUID()}`)),
  ),
);
const okDistinct = distinct.filter((r) => r.status === 201);
const tickets = okDistinct.map((r) => r.body.ticket_ref);
const numbers = tickets.map(ticketNumber).sort((a, b) => a - b);
const unique = new Set(tickets).size === tickets.length;
const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
console.log(`   created: ${okDistinct.length}/${concurrency}, unique: ${unique}, contiguous: ${contiguous}`);
console.log(`   tickets: ${numbers[0]} … ${numbers[numbers.length - 1]}`);
const failures = distinct.filter((r) => r.status !== 201);
if (failures.length)
  console.log('   failures:', failures.map((f) => `${f.status} ${f.body?.code ?? ''}`).join(', '));
const latencies = distinct.map((r) => r.ms);
console.log(
  `   latency p50 ${Math.round(percentile(latencies, 50))} ms · p95 ${Math.round(percentile(latencies, 95))} ms`,
);

console.log(`→ ${concurrency} concurrent creates with ONE key`);
const oneKey = `booking_${crypto.randomUUID()}`;
const same = await Promise.all(
  Array.from({ length: concurrency }, () => call('create_booking', payload(oneKey))),
);
const sameTickets = new Set(
  same.filter((r) => r.status === 201 || r.status === 200).map((r) => r.body.ticket_ref),
);
const createdFlags = same.filter((r) => r.body?.created === true).length;
console.log(
  `   distinct tickets: ${sameTickets.size} (expected 1), created=true responses: ${createdFlags} (expected 1)`,
);

const pass =
  okDistinct.length === concurrency && unique && contiguous && sameTickets.size === 1 && createdFlags === 1;
console.log(pass ? '✔ PASS' : '✘ FAIL');
process.exit(pass ? 0 : 1);
