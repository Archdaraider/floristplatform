CREATE TABLE `capacity_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`date_local` text NOT NULL,
	`method` text NOT NULL,
	`window_label` text NOT NULL,
	`total_capacity` integer NOT NULL,
	`reserved_capacity` integer DEFAULT 0 NOT NULL,
	`committed_capacity` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "capacity_total_non_negative" CHECK("capacity_slots"."total_capacity" >= 0),
	CONSTRAINT "capacity_reserved_non_negative" CHECK("capacity_slots"."reserved_capacity" >= 0),
	CONSTRAINT "capacity_committed_non_negative" CHECK("capacity_slots"."committed_capacity" >= 0),
	CONSTRAINT "capacity_not_overbooked" CHECK("capacity_slots"."reserved_capacity" + "capacity_slots"."committed_capacity" <= "capacity_slots"."total_capacity")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `capacity_seller_date_method_unique` ON `capacity_slots` (`seller_id`,`date_local`,`method`);--> statement-breakpoint
CREATE INDEX `capacity_date_method_idx` ON `capacity_slots` (`date_local`,`method`);--> statement-breakpoint
CREATE TABLE `delivery_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`name` text NOT NULL,
	`postal_sectors_json` text NOT NULL,
	`fee_cents` integer NOT NULL,
	`window_label` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "delivery_zones_fee_non_negative" CHECK("delivery_zones"."fee_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `delivery_zones_seller_enabled_idx` ON `delivery_zones` (`seller_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`sender_role` text NOT NULL,
	`sender_name` text NOT NULL,
	`body` text NOT NULL,
	`message_type` text NOT NULL,
	`read_at` text,
	`idempotency_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "messages_body_not_empty" CHECK(length("messages"."body") > 0)
);
--> statement-breakpoint
CREATE INDEX `messages_order_created_idx` ON `messages` (`order_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_idempotency_key_unique` ON `messages` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`event_type` text NOT NULL,
	`from_state` text,
	`to_state` text,
	`reason` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`idempotency_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_events_order_created_idx` ON `order_events` (`order_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_events_idempotency_key_unique` ON `order_events` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`seller_id` text NOT NULL,
	`product_id` text NOT NULL,
	`capacity_slot_id` text NOT NULL,
	`buyer_name` text NOT NULL,
	`buyer_email` text NOT NULL,
	`recipient_name` text,
	`recipient_phone` text,
	`recipient_address` text,
	`gift_message` text,
	`delivery_instructions` text,
	`commercial_status` text NOT NULL,
	`operational_status` text NOT NULL,
	`payment_status` text NOT NULL,
	`payout_status` text NOT NULL,
	`fulfilment_method` text NOT NULL,
	`requested_date_local` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Singapore' NOT NULL,
	`window_label` text NOT NULL,
	`delivery_postcode` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`delivery_cents` integer NOT NULL,
	`platform_fee_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`commission_cents` integer NOT NULL,
	`seller_net_cents` integer NOT NULL,
	`product_snapshot_json` text NOT NULL,
	`fee_snapshot_json` text NOT NULL,
	`policy_snapshot_json` text NOT NULL,
	`payment_reference` text NOT NULL,
	`accept_by` text NOT NULL,
	`accepted_at` text,
	`completed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`capacity_slot_id`) REFERENCES `capacity_slots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_quantity_positive" CHECK("orders"."quantity" > 0),
	CONSTRAINT "orders_subtotal_non_negative" CHECK("orders"."subtotal_cents" >= 0),
	CONSTRAINT "orders_delivery_non_negative" CHECK("orders"."delivery_cents" >= 0),
	CONSTRAINT "orders_total_non_negative" CHECK("orders"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_key_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_seller_status_idx` ON `orders` (`seller_id`,`operational_status`);--> statement-breakpoint
CREATE INDEX `orders_accept_by_idx` ON `orders` (`commercial_status`,`accept_by`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`base_price_cents` integer NOT NULL,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`occasion_tags_json` text DEFAULT '[]' NOT NULL,
	`style_tags_json` text DEFAULT '[]' NOT NULL,
	`flower_tags_json` text DEFAULT '[]' NOT NULL,
	`image_url` text NOT NULL,
	`image_alt` text NOT NULL,
	`representative_photo_disclosure` text NOT NULL,
	`dimensions` text NOT NULL,
	`fulfilment_methods_json` text DEFAULT '[]' NOT NULL,
	`lead_time_hours` integer DEFAULT 24 NOT NULL,
	`policy_snapshot_json` text NOT NULL,
	`published_at` text,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_price_non_negative" CHECK("products"."base_price_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_seller_status_idx` ON `products` (`seller_id`,`status`);--> statement-breakpoint
CREATE TABLE `sellers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`trading_name` text NOT NULL,
	`legal_name` text NOT NULL,
	`uen` text,
	`seller_type` text NOT NULL,
	`status` text NOT NULL,
	`verification_status` text NOT NULL,
	`psp_ready` integer DEFAULT false NOT NULL,
	`accepting_new_orders` integer DEFAULT false NOT NULL,
	`paused_until` text,
	`gst_registered` integer DEFAULT false NOT NULL,
	`commission_bps` integer DEFAULT 1500 NOT NULL,
	`public_story` text NOT NULL,
	`public_area` text NOT NULL,
	`public_address` text,
	`style_tags_json` text DEFAULT '[]' NOT NULL,
	`fulfilment_methods_json` text DEFAULT '[]' NOT NULL,
	`response_sla_minutes` integer DEFAULT 60 NOT NULL,
	`default_lead_time_hours` integer DEFAULT 24 NOT NULL,
	`rating_hundredths` integer DEFAULT 0 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "sellers_commission_bps_non_negative" CHECK("sellers"."commission_bps" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sellers_slug_unique` ON `sellers` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `sellers_uen_unique` ON `sellers` (`uen`);--> statement-breakpoint
CREATE INDEX `sellers_status_idx` ON `sellers` (`status`,`verification_status`);