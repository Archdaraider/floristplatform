CREATE TABLE `order_seller_notes` (
	`order_id` text PRIMARY KEY NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "order_seller_notes_body_length" CHECK(length("order_seller_notes"."body") <= 5000),
	CONSTRAINT "order_seller_notes_version_positive" CHECK("order_seller_notes"."version" > 0)
);
