# Petalfolk mobile UX standard

This is the working standard for Petalfolk’s buyer, seller, and operations interfaces. It turns current accessibility and mobile-platform guidance into product rules the team can test.

## Product outcome

The buyer path should read as one obvious sequence:

`Find flowers → View arrangement → Add to basket → Continue to checkout → Request order → Track order`

The seller path should always put the next deadline and the next valid order action before supporting detail. Controls that are not connected must not look actionable.

## Readability baseline

- Body copy: 17px on mobile, with a 1.5–1.65 line height.
- Supporting copy: 14px on mobile. Micro labels may use 13px only when they are nonessential and high contrast.
- Buttons and form values: 16px, semibold or bold.
- Functional text must not use a 300 weight. Thin editorial type is reserved for large display headings.
- Normal text must meet at least 4.5:1 contrast. Controls, focus indicators, meaningful borders, and status graphics need at least 3:1.
- Text must remain usable at 200% zoom, at 320 CSS px, and with WCAG text-spacing overrides.

Sources: [Apple typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Material 3 type scale](https://developer.android.com/develop/ui/compose/designsystems/material3), [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [WCAG resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), and [WCAG text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).

## Actions and touch

- Use one prominent primary action per screen or decision point. Back, cancel, remove, and contextual links remain visibly secondary.
- Action labels use a verb plus object: “Find available flowers,” “View arrangement,” and “Request order.” Avoid “Go,” “OK,” “Submit,” and icon-only forward arrows.
- Interactive targets are at least 48 × 48 CSS px. This exceeds WCAG 2.2 AA’s minimum and follows the stronger Android target while also clearing Apple’s 44pt recommendation.
- Every asynchronous action follows `idle → validating → submitting → success or recoverable error` and prevents duplicate submission.
- Loading, result counts, success, and failure are exposed as status messages. Field errors explain how to recover and focus moves to the first invalid control.

Sources: [Apple buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility), [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), and [GOV.UK validation](https://design-system.service.gov.uk/patterns/validation/).

## Content rules

- One H1 and one clear job per screen.
- Introductory copy is no more than two short sentences.
- Ask only for information needed at that point. Date, fulfilment method, and delivery postcode drive the first search; occasion, style, and budget refine results afterward.
- Each product card contains seller, title, price, essential fulfilment facts, and one action. Full description and policy detail belong in product details.
- Use progressive disclosure for included items, timing, and substitution rules.
- Never repeat a question or make the user re-enter a value already known in the journey.

Sources: [Apple writing](https://developer.apple.com/design/human-interface-guidelines/writing), [GOV.UK question pages](https://design-system.service.gov.uk/patterns/question-pages/), and [WCAG redundant entry](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html).

## Flow acceptance checks

Test the critical paths at 320, 360, 390, and 430px, plus 200% browser zoom:

1. Search with delivery and pickup, including loading, zero results, retry, and changed filters.
2. Open a product, disclose secondary details, add it, remove it, and recover from cross-seller basket conflict.
3. Complete checkout, correct multiple invalid fields, reject missing consent, double-tap submit, retry a server error, and recover when availability changes.
4. Confirm the tracking page shows the reference, current state, next expected event, message success/error, and a stable delivery timeline.
5. Confirm seller orders are sorted by the real next deadline and the next valid action is visible before supporting detail.
6. Test keyboard order, focus visibility, Escape/close behavior, VoiceOver/TalkBack labels, reduced motion, long content, offline/slow requests, and browser Back/refresh.

## Evidence limit

The July 2026 implementation pass was code-, API-, and standards-backed. The in-app browser was unavailable, so screenshot comparison, device text-size testing, and assistive-technology testing remain required before calling the interface visually or WCAG verified.
