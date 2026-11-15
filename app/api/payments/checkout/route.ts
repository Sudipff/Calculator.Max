import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/security';
import { getSupabaseConfig } from '@/utils/supabase/config';
import {
  PLAN_PRICE_CENTS,
  SubscriptionPlanId,
  formatStorageLimitLabel,
  getPlanDisplayName,
  getPlanLimitBytes,
} from '@/lib/subscriptionPlans';

export const dynamic = 'force-dynamic';

type PaymentMethodType = 'card' | 'upi' | 'netbanking';

function passesLuhnCheck(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function isValidExpiry(expiryRaw: string): boolean {
  const match = expiryRaw.trim().match(/^(\d{2})\/(\d{2,4})$/);
  if (!match) return false;
  const month = Number(match[1]);
  let year = Number(match[2]);
  if (month < 1 || month > 12) return false;
  if (year < 100) year += 2000;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  if (year > currentYear + 20) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'api/payments/checkout');
  if (!auth.ok) return auth.response;

  const uid = auth.actor.uid;
  const token = auth.actor.token;
  const body = await req.json().catch(() => ({}));

  const targetPlan = body.planId as SubscriptionPlanId;
  if (targetPlan !== 'pro' && targetPlan !== 'team' && targetPlan !== 'enterprise') {
    return NextResponse.json(
      { error: 'Please select a valid paid plan (Pro, Team, or Enterprise) to upgrade.' },
      { status: 400 }
    );
  }

  const paymentMethod: PaymentMethodType =
    body.paymentMethod === 'upi' || body.paymentMethod === 'netbanking'
      ? body.paymentMethod
      : 'card';

  let last4 = '';
  let payerSummary = '';

  if (paymentMethod === 'card') {
    const rawCard = String(body.cardNumber || '').replace(/[\s-]/g, '');
    const cardholderName = String(body.cardholderName || '').trim();
    const expiry = String(body.expiry || '').trim();
    const cvc = String(body.cvc || '').trim();

    if (cardholderName.length < 2) {
      return NextResponse.json(
        { error: 'Please enter the cardholder name.' },
        { status: 400 }
      );
    }
    if (!passesLuhnCheck(rawCard)) {
      return NextResponse.json(
        { error: 'Please enter a valid card number.' },
        { status: 400 }
      );
    }
    if (!isValidExpiry(expiry)) {
      return NextResponse.json(
        { error: 'Card expiration date is invalid or expired (use MM/YY).' },
        { status: 400 }
      );
    }
    if (!/^\d{3,4}$/.test(cvc)) {
      return NextResponse.json(
        { error: 'Please enter a valid 3 or 4 digit security code (CVC).' },
        { status: 400 }
      );
    }
    last4 = rawCard.slice(-4);
    payerSummary = `Card ending in ${last4}`;
  } else if (paymentMethod === 'upi') {
    const upiId = String(body.upiId || '').trim();
    if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9]{2,}$/.test(upiId)) {
      return NextResponse.json(
        { error: 'Please enter a valid UPI ID (e.g. name@okaxis).' },
        { status: 400 }
      );
    }
    last4 = upiId.slice(-4);
    payerSummary = `UPI (${upiId})`;
  } else {
    const bankName = String(body.bankName || '').trim();
    if (bankName.length < 2) {
      return NextResponse.json(
        { error: 'Please select your NetBanking provider.' },
        { status: 400 }
      );
    }
    last4 = bankName.slice(0, 4).toUpperCase();
    payerSummary = `NetBanking (${bankName})`;
  }

  const amountCents = PLAN_PRICE_CENTS[targetPlan];
  const newLimitBytes = getPlanLimitBytes(targetPlan);
  const transactionId = `txn_${crypto.randomBytes(10).toString('hex')}`;
  const receiptNumber = `CM-${new Date().getFullYear()}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;
  const processedAt = new Date().toISOString();

  let dbPersisted = false;

  try {
    const { url, key } = getSupabaseConfig();
    if (url && key) {
      const supabase = createClient(url, key, {
        global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      });

      const subPayload: Record<string, unknown> = {
        user_id: uid,
        plan_id: targetPlan,
        storage_limit_bytes: newLimitBytes,
        status: 'active',
        updated_at: processedAt,
      };
      if (typeof body.countryRegion === 'string' && body.countryRegion.trim()) {
        subPayload.country_region = body.countryRegion.trim().slice(0, 80);
      }

      const { error: subErr } = await supabase
        .from('user_subscriptions')
        .upsert(subPayload, { onConflict: 'user_id' });

      if (!subErr) {
        dbPersisted = true;
      }

      // Record payment transaction audit row when table is provisioned
      await supabase.from('payment_transactions').insert({
        transaction_id: transactionId,
        receipt_number: receiptNumber,
        user_id: uid,
        plan_id: targetPlan,
        amount_cents: amountCents,
        currency: 'USD',
        payment_method: paymentMethod,
        payment_last4: last4,
        storage_limit_bytes: newLimitBytes,
        status: 'succeeded',
        created_at: processedAt,
      });
    }
  } catch {
    // Non-blocking if SQL tables have not been created in Supabase yet
  }

  return NextResponse.json({
    ok: true,
    status: 'succeeded',
    transactionId,
    receiptNumber,
    planId: targetPlan,
    planName: getPlanDisplayName(targetPlan),
    membershipStatus: `${getPlanDisplayName(targetPlan)} Member`,
    limitBytes: newLimitBytes,
    limitLabel: formatStorageLimitLabel(newLimitBytes),
    amountCents,
    currency: 'USD',
    paymentMethod,
    payerSummary,
    dbPersisted,
    processedAt,
  });
}
