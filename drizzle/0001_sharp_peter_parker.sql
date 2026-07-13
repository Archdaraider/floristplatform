DROP INDEX IF EXISTS `messages_idempotency_key_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `messages_order_idempotency_key_unique` ON `messages` (`order_id`,`idempotency_key`);--> statement-breakpoint
DROP INDEX IF EXISTS `order_events_idempotency_key_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `order_events_order_idempotency_key_unique` ON `order_events` (`order_id`,`idempotency_key`);
