# AI Section Generator

An internal tool for designing interactive website sections with Claude. Load your design system, brief the section, get three different designs, refine the one you like, preview it at your own breakpoints, then copy the code or download it as HTML for any website or CMS.

## How it works

1. **Projects.** Create a project for a site or brand, or start a quick *blank section* that uses the default design system. A project holds many sections.
2. **Project settings.** Set the business type and description, the design system (tokens by form, pasted JSON or CSS variables, or an uploaded file), breakpoints, and defaults like the accessibility target and the CMS.
3. **Chat.** Each section opens a workspace with a chat on the left. Describe what you need, attach reference images (paste or upload) and paste links. Claude reads the links, asks up to 3 questions only if something essential is missing, then writes a brief.
4. **Choose.** Claude generates 3 designs in parallel, each with a different creative direction, shown on the right. Ask for 3 new options any time.
5. **Edit and refine.** Pick one and it opens in the visual editor. Keep chatting to change it, or click an element in the preview first so the change applies only to that element. You can also edit text, attributes and per-breakpoint styles by hand, with undo/redo and versions. Switch to *Try it* to use the interactions.
6. **Export.** Preview at each breakpoint or any width, then copy the code or download HTML.

### Structured designs

Claude doesn't write HTML directly. It returns a *scene*: a JSON tree of elements with styles (base, per breakpoint, hover, focus, active state) and behaviors (`src/lib/scene/types.ts`). The compiler (`src/lib/scene/compile.ts`) turns a scene into scoped HTML and CSS plus a small vanilla-JS runtime (`src/lib/scene/runtime.ts`). The runtime powers reveal, tabs, accordion, carousel, toggle, counter, modal, filter, before/after compare and parallax, with keyboard support, ARIA and reduced-motion handling. The visual editor edits the scene, so every change compiles to the same clean, paste-ready output.

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

## Storage and sign-in

Projects and sections go through the `Store` interface in `src/lib/storage.ts`.

- **Shared (Supabase).** Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to content-intake's Supabase project. Data lives in the `section_gen` schema (projects and sections tables, row-level security). People sign in with their content-intake account (email and password, or an emailed link when password login is off there); this app never creates accounts. Access is limited to emails matching a pattern in `section_gen.allowed_emails`, and the API routes check the same thing, so only members can spend Claude credits. The `section_gen` schema must be listed under *Exposed schemas* in the Supabase API settings.
- **Local.** Without those variables everything stays in the browser's `localStorage` and there's no sign-in.

## Project layout

```
src/app/                    home, /p/[projectId], /p/[projectId]/settings, /s/[sectionId]
src/app/api/chat            one chat turn: questions, brief + 3 designs, or a refinement
src/app/api/refine          apply a change request to the current design
src/lib/server/             design generation, refinement and the member check
src/lib/scene/              scene types, compiler, runtime, validation, editor ops
src/lib/storage.ts          local and Supabase stores
src/lib/prompts.ts          system prompts and prompt builders
src/components/app/         home, project, settings, workspace (chat + designs), sign-in
src/components/editor/      visual editor
```

## Deploying

Works on Vercel out of the box. Add `ANTHROPIC_API_KEY`, and the two `NEXT_PUBLIC_SUPABASE_*` variables for shared storage, in the project's environment variables. In content-intake's Supabase Auth settings, add the deployed URL to the redirect URLs so emailed sign-in links work. Generation routes set `maxDuration = 300` seconds.
