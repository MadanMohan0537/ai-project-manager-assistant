# AI Project Manager Assistant

A low-cost, full-stack Cloudflare Worker that turns a project description and team profiles into an actionable project plan. The browser UI and API deploy together, and the AI call runs through a protected Workers AI binding.

## Why this version

The former Python/Vercel implementation could not run on Cloudflare Workers and its API entry point contained runtime errors. It also used five or more sequential LLM calls for every plan. This version performs one structured Workers AI call, reducing latency and model cost.

## Run locally

Requirements: Node.js 20+ and a Cloudflare account.

```bash
npm install
npx wrangler login
npm run dev
```

Open the local URL printed by Wrangler. Local Workers AI requests use your authenticated Cloudflare account.

## Deploy

```bash
npm run check
npm run deploy
```

Wrangler creates or updates the `ai-project-manager-assistant` Worker. Static assets in `public/` are deployed with the API.

## API

### `GET /api/health`

Returns runtime health.

### `POST /api/run`

```json
{
  "project": "Build a customer feedback dashboard",
  "team": [
    { "name": "Alice", "profile": "React and product design" },
    { "name": "Bob", "profile": "APIs, databases, and Cloudflare" }
  ]
}
```

Limits: 64 KB request body, 10,000-character project description, and 20 team members.

## Configuration

`wrangler.jsonc` binds Workers AI as `AI` and uses `@cf/meta/llama-3.1-8b-instruct-fp8`. Change `AI_MODEL` to another compatible Workers AI text-generation model if needed.

No OpenAI or Azure key is required, and no secret is sent to the browser.
