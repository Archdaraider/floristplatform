# Petalfolk operating-cost rundown

**Updated:** 16 July 2026
**Currency:** USD, before tax
**Scope:** Current marketplace hosting plus the natural-language flower-search feature

## Recommended setup

Use a hybrid search:

1. A deterministic parser handles common flowers, occasions, colours, wrapping terms, budgets, and ordinary typos for free.
2. Cloudflare Workers AI handles ambiguous or multi-constraint phrases.
3. Every model result is validated against the catalogue taxonomy before it can filter products.
4. If AI is unavailable, slow, or over quota, search falls back to the local parser and still returns bookable products.

The selected hosted model is Cloudflare's `@cf/meta/llama-3.1-8b-instruct-fast`. Cloudflare's May 2026 deprecation notice explicitly keeps this `-fast` variant active, and its JSON Mode documentation lists the model as schema-capable. It is a good balance of typo/intent quality, low latency, JSON output, and cost. The app sends only the search phrase. It never sends buyer, recipient, address, postcode, order, payment, or seller-private data. See the [deprecation notice](https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/) and [JSON Mode support list](https://developers.cloudflare.com/workers-ai/features/json-mode/).

Cloudflare Workers AI has a default **300 text-generation requests per minute**, so it does not have the 10-RPM problem. Common searches do not consume that allowance because they resolve locally. Cloudflare accepts custom-limit requests if the production peak later exceeds 300 RPM. See [Workers AI limits](https://developers.cloudflare.com/workers-ai/platform/limits/).

### Current private-preview status

The deployed ChatGPT Sites preview was checked after release and currently reports the `local` engine for the example search. That means it is serving the typo-tolerant, taxonomy-aware search at zero model cost, but it is **not yet consuming hosted LLM inference**. LLM enrichment becomes active when either:

- the same build is deployed to a Cloudflare Worker with its `AI` binding attached; or
- a paid Groq Developer key is stored server-side as `GROQ_API_KEY` and the site is redeployed.

Never put either credential in Git or browser code. Until provider analytics and the API response report `workers-ai` or `groq`, budget the preview as deterministic smart search rather than paid LLM search. This fallback is intentional: it preserves availability and handles the supplied typo-heavy example even when no model provider is configured.

## Hosted model cost per request

The estimates below assume a deliberately small intent-extraction call:

- 250 input tokens
- 60 output tokens
- no retry
- no web search, embeddings, chat history, or user/order data

| Provider/model | Throughput position | Input/output price per 1M tokens | Approx. cost/search | 100,000 AI searches | 1M AI searches |
| --- | --- | ---: | ---: | ---: | ---: |
| **Cloudflare Workers AI, fast Llama 8B** | 300 RPM default; recommended for this app | $0.045 / $0.384 | **$0.000034** | **$3.43** | **$34.29** |
| Cloudflare Workers AI, Llama 3.2 1B | Same task-level limit; cheaper but weaker extraction | $0.027 / $0.201 | $0.000019 | $1.88 | $18.81 |
| **Groq Developer, GPT-OSS 20B** | Up to 1,000 RPM and 250K TPM at the documented base Developer limit | $0.075 / $0.30 | **$0.000037** | **$3.68** | **$36.75** |
| Gemini 2.5 Flash-Lite paid | Limits are account/tier-specific in AI Studio | $0.10 / $0.40 | $0.000049 | $4.90 | $49.00 |

Pricing sources: [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Groq models and Developer limits](https://console.groq.com/docs/models), and [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing). Cloudflare's table currently publishes the fast 8B token rate under the `fp8-fast` label; the table above uses that rate as the planning estimate for the selected fast 8B variant. Confirm the actual model line in Cloudflare usage analytics before forecasting a large production commitment.

Cloudflare includes **10,000 neurons per day free**. For prompts this small, that is roughly a few thousand AI-parsed searches daily; exact consumption should be taken from the Cloudflare dashboard because neuron usage varies with actual input/output. Above the free allocation, Workers AI is $0.011 per 1,000 neurons. The local parser increases practical capacity because simple searches use zero neurons.

Groq's free plan is not the production recommendation: GPT-OSS 20B is limited to 30 RPM and 1,000 requests/day on the documented free tier. The pay-as-you-go Developer tier is the relevant comparison and has no upfront charge beyond usage. See [Groq free limits](https://console.groq.com/docs/rate-limits/) and [Groq billing](https://console.groq.com/docs/billing-faqs).

Gemini's free tier is useful for development, but active limits now vary by account and model and are not guaranteed. Free-tier prompts may also be used to improve Google products; paid usage has different data treatment. That makes it less predictable for this marketplace than Workers AI. See [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [pricing](https://ai.google.dev/gemini-api/docs/pricing), and [terms](https://ai.google.dev/gemini-api/terms).

## Expected monthly AI bill for Petalfolk

The hybrid design should resolve most direct searches locally. The table assumes **30% of submitted searches need an LLM** and uses the selected fast Cloudflare model. It shows gross token cost before applying the daily free allocation, so the actual small-volume bill should be lower.

| Submitted searches/month | AI calls at 30% | Gross AI token cost | Likely operating interpretation |
| ---: | ---: | ---: | --- |
| 10,000 | 3,000 | **$0.10** | Usually covered by the daily free allocation |
| 100,000 | 30,000 | **$1.03** | Still effectively negligible |
| 1,000,000 | 300,000 | **$10.29** | Well below the cost of a dedicated GPU |
| 10,000,000 | 3,000,000 | **$102.87** | Review peak RPM and caching; still cheaper than managing several GPU replicas |

Worst case—if every search calls the model—is approximately $3.43 per 100,000 searches or $34.29 per million searches.

## Marketplace hosting and database

The current app runs as a Cloudflare-compatible Worker with D1.

### Prototype/free level

- Workers Free: 100,000 dynamic Worker requests/day; static assets are free and unlimited.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, and 5 GB total storage.
- Workers AI: 10,000 neurons/day free.
- Current ChatGPT Sites hosting is a beta feature included with eligible ChatGPT plans; it should be treated as a preview channel, not the final production cost contract.

At closed-beta volume, the infrastructure can plausibly remain at **$0 incremental usage cost**, apart from the existing eligible ChatGPT plan and any domain/email/monitoring services.

### Production baseline

Cloudflare Workers Paid starts at **$5/month** and includes:

- 10 million dynamic requests/month, then $0.30 per additional million;
- 30 million CPU milliseconds/month, then $0.02 per additional million CPU milliseconds;
- D1's first 25 billion rows read/month;
- D1's first 50 million rows written/month; and
- 5 GB D1 storage.

See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

A reasonable early production budget for the existing app plus hybrid search is therefore:

| Stage | Approximate monthly platform + AI usage |
| --- | ---: |
| Concierge pilot / closed beta | **$0–$5** |
| Around 100K searches/month | **about $5–$7** |
| Around 1M searches/month | **about $15–$40**, depending on how often AI is needed and actual CPU/database use |
| Around 10M searches/month | **about $110–$400**, dominated by AI-call ratio and peak capacity |

These figures exclude payment-provider fees, transactional email/SMS, a production domain, support tools, monitoring, image storage, staff, taxes, and refunds.

## Self-hosting a local LLM

Self-hosting avoids per-token vendor pricing but adds a GPU endpoint, deployment work, monitoring, scaling, patching, model downloads, cold-start management, and failover.

### Dedicated GPU running continuously

Current Runpod on-demand examples:

| GPU | Hourly | Approx. 720-hour month | Suitable intent model |
| --- | ---: | ---: | --- |
| RTX A5000, 24 GB | $0.27 | **$194.40/month** | Quantized 3B–8B model |
| NVIDIA L4, 24 GB | $0.39 | **$280.80/month** | Quantized 3B–8B with better serving efficiency |
| RTX 4090, 24 GB | $0.69 | **$496.80/month** | Higher-throughput quantized 8B model |

Source: [Runpod GPU pricing](https://www.runpod.io/pricing).

At $0.000034 per hosted Cloudflare inference, the cheapest always-on A5000 does not break even until roughly **5.7 million AI calls/month**, before engineering and redundancy. With only 30% of searches needing AI, that is about 19 million submitted searches/month.

One GPU is also one failure domain. A production service usually needs at least two replicas or a hosted-provider fallback, doubling the base GPU cost if high availability matters.

### Serverless GPU

Runpod lists a 24 GB serverless GPU class at about $0.69 per active GPU-hour. A two-second inference costs roughly **$0.00038**, or about **$38 per 100,000 calls**, before cold starts and storage. Modal lists T4 at $0.000164/second and L4 at $0.000222/second, with $30/month Starter credit; at two seconds that is roughly $33–$44 per 100,000 calls. Sources: [Runpod pricing](https://www.runpod.io/pricing) and [Modal pricing](https://modal.com/pricing).

This is materially more expensive per short extraction request than Workers AI or Groq, though it can be attractive when model control, data isolation, or custom weights matter.

### CPU-only VPS

A CPU-only model is possible but not recommended for a public search box with burst traffic. DigitalOcean currently lists:

- 4 vCPU / 8 GB basic VM: **$48/month**
- 8 vCPU / 16 GB basic VM: **$96/month**
- 8 dedicated CPU / 16 GB CPU-optimized VM: **$168/month**

Source: [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets).

A quantized 1B–3B model can fit the smaller machines, and a quantized 8B model can fit 16 GB, but latency and concurrent throughput will be much worse than GPU or hosted inference. It is suitable for internal tools, batch work, or a low-traffic fallback—not a high-conversion marketplace search path.

## Scaling decision

1. **Start:** local typo/facet parser + Workers AI. Expected incremental AI cost is near zero in the pilot.
2. **At sustained peaks near 300 AI RPM:** increase local/cache hit rate, request a Cloudflare limit increase, or enable Groq Developer as overflow.
3. **At millions of AI calls/month:** compare actual p95 latency and bill against one serverless GPU endpoint.
4. **Consider dedicated self-hosting only** when usage is consistently high enough to keep GPUs busy, model/data control justifies the operations burden, and at least two replicas fit the budget.

## Cost controls already built into the feature

- AI runs only on submit, never per keystroke.
- Obvious searches resolve locally for $0.
- Normalized-query results are cached per running isolate.
- Prompts and completions are deliberately short.
- Provider calls time out quickly and fall back locally.
- Model output is limited to known filter values and cannot execute SQL.
- Search remains available when provider quota is exhausted.
- The raw query is capped at 180 characters.
