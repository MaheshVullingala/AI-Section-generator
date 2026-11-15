# AI Section Generator

An internal tool for designing interactive website sections with Claude. Load your design system, brief the section, get three different designs, refine the one you like, preview it at your own breakpoints, then copy the code or download it as HTML for any website or CMS.

## How it works

1. **Design system.** Add tokens with a form, paste JSON (W3C Design Tokens, Tokens Studio or plain nested JSON), paste CSS custom properties, or upload a `.json` / `.css` file. Set default breakpoints and brand notes. Saved design systems can be reused.
2. **Business.** Pick the business or product type and describe it.
3. **Section.** Pick the section type (hero, pricing, FAQ, testimonials, ...) and answer its questions.
4. **Content.** Provide the copy or let Claude write it, add image URLs and CTAs, and choose interactions.
5. **Breakpoints.** Set the breakpoints for this section, the accessibility target, the target CMS, and whether JavaScript is allowed.
6. **Review.** Claude checks the brief and asks up to 4 follow-up questions where something important is missing.
7. **Choose.** Claude generates 3 variants in parallel, each with a different creative direction (clean, editorial, interaction-forward).
8. **Refine and export.** Ask for changes in plain language or use quick actions. Each change is a new version you can go back to. Preview at each breakpoint, side by side, or at any custom width. Copy the full code, copy HTML/CSS/JS separately, or download a snippet or standalone page.

### Generated code

Every section is a single `<section>` with scoped CSS (all selectors start with a unique root class) and optional vanilla JS in an IIFE. It uses your tokens as CSS variables, is mobile-first with `min-width` media queries at your breakpoints, and respects `prefers-reduced-motion`. No frameworks or external libraries, so it pastes into WordPress, Webflow, Shopify, HubSpot or plain HTML.

The system prompt (`src/lib/prompts.ts`) sets concrete patterns for each interaction (tabs, accordions, carousels, toggles, counters, scroll reveals, modals and more), including keyboard support, ARIA and progressive enhancement. Each business type comes with interaction guidance (`src/lib/catalog.ts`), and the three variants use different motion levels: subtle, expressive and rich.

After each generation, a quick static check (`src/lib/check.ts`) flags unscoped CSS, missing focus styles, missing reduced-motion handling, unscoped JS and requested interactions that weren't built. Issues show on the design card, and one click asks Claude to fix them.

## Setup

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

The API key is only used by the server routes in `src/app/api/` and is never sent to the browser.

## Models

All Claude calls go through `src/lib/claude.ts`. By default both generation and refinement use `claude-opus-5-5` at `medium` effort, with server-side refusal fallbacks enabled. Override with the `CLAUDE_*` variables in `.env.example`, for example `CLAUDE_GENERATE_MODEL=claude-sonnet-5-5` for faster and cheaper first drafts.

## Storage

The MVP stores design systems and sections in the browser's `localStorage` (see `src/lib/storage.ts`). Everything goes through that module, so swapping in Supabase for shared team storage and login only touches that file plus an auth layer.

## Project layout

```
src/app/api/generate   3 variants in parallel
src/app/api/followups  clarifying questions for the brief
src/app/api/refine     apply a change request to the current version
src/lib/tokens.ts      token parsers (JSON, CSS vars) and CSS variable output
src/lib/prompts.ts     system prompt and prompt builders
src/lib/catalog.ts     business types, section types and their questions
src/lib/export.ts      snippet and standalone page builders
src/components/        wizard, design system editor, preview, export
```

## Deploying

Works on Vercel out of the box. Add `ANTHROPIC_API_KEY` in the project's environment variables. Generation routes set `maxDuration = 300` seconds.
