import { ensureDemoDatabase } from "../db/bootstrap";
import { nowIso } from "./time";

type ExpiredOrderRow = {
  id: string;
  capacity_slot_id: string;
  quantity: number;
};

/**
 * Reconciles expired reservations on normal marketplace activity.
 *
 * Production should also schedule this command, but keeping it idempotent and
 * read-triggered prevents the private demo from holding capacity indefinitely
 * when no worker is running.
 */
export async function reconcileExpiredOrders() {
  const database = await ensureDemoDatabase();
  const now = nowIso();
  const expired = await database
    .prepare(
      `SELECT id, capacity_slot_id, quantity
       FROM orders
       WHERE operational_status = 'awaiting_acceptance' AND accept_by < ?
       ORDER BY accept_by ASC`
    )
    .bind(now)
    .all<ExpiredOrderRow>();

  let reconciled = 0;
  for (const order of expired.results) {
    const eventId = crypto.randomUUID();
    const claimExpiry = database
      .prepare(
        `INSERT OR IGNORE INTO order_events
          (id, order_id, actor_role, event_type, from_state, to_state, reason,
           metadata_json, idempotency_key, created_at)
         SELECT ?, ?, 'system', 'order.expired', 'awaiting_acceptance', 'declined',
                'Seller confirmation window expired; payment authorisation voided and capacity released.',
                ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM orders
           WHERE id = ? AND operational_status = 'awaiting_acceptance' AND accept_by < ?
         )`
      )
      .bind(
        eventId,
        order.id,
        JSON.stringify({ paymentAction: "simulated_void", expiryReconciled: true }),
        `expiry:${order.id}:event`,
        now,
        order.id,
        now
      );
    const updateOrder = database
      .prepare(
        `UPDATE orders
         SET operational_status = 'declined', commercial_status = 'declined',
             payment_status = 'voided', payout_status = 'voided',
             version = version + 1, updated_at = ?
         WHERE id = ? AND operational_status = 'awaiting_acceptance' AND accept_by < ?
           AND EXISTS (SELECT 1 FROM order_events WHERE id = ?)`
      )
      .bind(now, order.id, now, eventId);
    const releaseCapacity = database
      .prepare(
        `UPDATE capacity_slots
         SET reserved_capacity = CASE
               WHEN reserved_capacity >= ? THEN reserved_capacity - ?
               ELSE 0
             END,
             version = version + 1, updated_at = ?
         WHERE id = ?
           AND EXISTS (SELECT 1 FROM order_events WHERE id = ?)
           AND EXISTS (
             SELECT 1 FROM orders
             WHERE id = ? AND operational_status = 'declined' AND updated_at = ?
           )`
      )
      .bind(
        order.quantity,
        order.quantity,
        now,
        order.capacity_slot_id,
        eventId,
        order.id,
        now
      );
    const insertMessage = database
      .prepare(
        `INSERT OR IGNORE INTO messages
          (id, order_id, sender_role, sender_name, body, message_type,
           idempotency_key, created_at)
         SELECT ?, ?, 'system', 'Florist Platform', ?, 'system', ?, ?
         WHERE EXISTS (SELECT 1 FROM order_events WHERE id = ?)
           AND EXISTS (
             SELECT 1 FROM orders
             WHERE id = ? AND operational_status = 'declined' AND updated_at = ?
           )`
      )
      .bind(
        crypto.randomUUID(),
        order.id,
        "The florist did not confirm in time. The simulated authorisation was voided and the reserved capacity was released.",
        `expiry:${eventId}:message`,
        now,
        eventId,
        order.id,
        now
      );

    const results = await database.batch([
      claimExpiry,
      updateOrder,
      releaseCapacity,
      insertMessage,
    ]);
    reconciled += results[1].meta.changes ?? 0;
  }

  return reconciled;
}
