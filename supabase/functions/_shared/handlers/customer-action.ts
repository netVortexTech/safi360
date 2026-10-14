// Actions a verified customer may take on their own booking. Status changes still go
// through transition_booking() (service role acting as "customer:<phone>"); anything the
// policy does not allow becomes a request for the office instead of a change.
import { customerActionRequest } from '../schemas.ts';
import { toErrorResult } from './errors.ts';
import { settingsOf } from './quote.ts';
import { allowedActions, requireOwnBooking, requireTrackingToken } from './tracking.ts';
import type { BookingDeps, HandlerResult, TransitionMeta } from './types.ts';
import type { BookingStatus } from '../enums.ts';

export interface CustomerActionResponse {
  action: string;
  /** What happened: a status change, or a request logged for the office. */
  outcome: 'status_changed' | 'request_logged';
  booking_status: BookingStatus;
}

export async function handleCustomerAction(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    const input = customerActionRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'customer_action');
    const { phone } = await requireTrackingToken(deps, tenant, input.token, ['tracking', 'booking']);
    const detail = await requireOwnBooking(deps, tenant, phone, input.booking_id);
    const settings = settingsOf(tenant);
    const now = deps.now();
    const policy = allowedActions(detail.booking, settings, now, deps.payments != null);
    if (!policy.actions.includes(input.action)) throw new Error('action_not_allowed');

    const meta: TransitionMeta = { actor: `customer:${phone}`, customer_visible: true };
    const b = detail.booking;
    let body: CustomerActionResponse;

    switch (input.action) {
      case 'approve_quote': {
        const to: BookingStatus =
          b.payment_mode === 'DEPOSIT' && b.deposit_tzs > b.paid_tzs ? 'AWAITING_PAYMENT' : 'CONFIRMED';
        const r = await deps.transition(b.id, to, null, { ...meta, message_key: 'event.quote_approved' });
        body = { action: input.action, outcome: 'status_changed', booking_status: r.status };
        break;
      }
      case 'reject_quote': {
        const r = await deps.transition(
          b.id,
          'QUOTE_REJECTED',
          input.reason?.trim() || 'customer_rejected_quote',
          {
            ...meta,
            message_key: 'event.quote_rejected',
          },
        );
        body = { action: input.action, outcome: 'status_changed', booking_status: r.status };
        break;
      }
      case 'cancel': {
        if (policy.cancel_within_policy) {
          const r = await deps.transition(b.id, 'CANCELLED', input.reason?.trim() || 'customer_cancelled', {
            ...meta,
            message_key: 'event.customer_cancelled',
          });
          body = { action: input.action, outcome: 'status_changed', booking_status: r.status };
        } else {
          await deps.openException(
            b.id,
            'CANCEL_OUTSIDE_POLICY',
            {
              reason: input.reason ?? null,
              requested_at: now.toISOString(),
              cancel_deadline: policy.cancel_deadline,
            },
            'high',
            meta,
          );
          await deps.addJobEvent(
            b.id,
            'customer_action',
            true,
            'event.cancel_requested',
            { reason: input.reason ?? null },
            meta,
          );
          body = { action: input.action, outcome: 'request_logged', booking_status: b.status };
        }
        break;
      }
      case 'request_reschedule': {
        await deps.openException(
          b.id,
          'RESCHEDULE_REQUESTED',
          {
            preferred_start: input.preferred_start ?? null,
            note: input.note ?? null,
            requested_at: now.toISOString(),
          },
          'normal',
          meta,
        );
        await deps.addJobEvent(
          b.id,
          'reschedule_requested',
          true,
          'event.reschedule_requested',
          { preferred_start: input.preferred_start ?? null },
          meta,
        );
        body = { action: input.action, outcome: 'request_logged', booking_status: b.status };
        break;
      }
    }
    return { status: 200, body };
  } catch (err) {
    return toErrorResult(err);
  }
}
