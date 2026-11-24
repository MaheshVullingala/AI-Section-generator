# Forma

_Ideas into Experiences._

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

## Hosting

The app is a standard Next.js server, so it runs on Vercel or on any Node.js host (`npm run build`, then `npm start`).

- On Vercel, import the repo and set the production branch to the branch that has the app (`main` once the PRs are merged).
- Set `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the host's environment variables. The two public values are read at build time, so redeploy after changing them.
- The API routes ask for up to 300 seconds (`maxDuration`), the limit on Vercel's Hobby plan. Each of the 3 designs is generated in its own request, so each gets the full limit.
- Requests stay small: the browser leaves out saved versions and sends only the newest reference images Claude uses. Vercel rejects requests over 4.5 MB.
- For email-link sign-in, add the app's URL to *Redirect URLs* in the Supabase project's auth settings. Password sign-in needs no change.

## Models

All Claude calls go through `src/lib/claude.ts`. By default:

| Job | Model | Env variable |
|---|---|---|
| The 3 designs | `claude-sonnet-5-5`, `medium` effort | `CLAUDE_GENERATE_MODEL` |
| Refinements | `claude-sonnet-5-5`, `medium` effort | `CLAUDE_REFINE_MODEL` |
| Brief chat (questions and brief) | `claude-haiku-5-5`, `low` effort | `CLAUDE_BRIEF_MODEL` |
| Brief chat when the message has links to open | `claude-sonnet-5-5` | `CLAUDE_BRIEF_WEB_MODEL` |
| Designs and refinements with **Premium** ticked | `claude-opus-5-5` | `CLAUDE_PREMIUM_MODEL` |

The **Premium** checkbox under the chat box switches designs and refinements to Opus, which costs about twice as much as Sonnet. Set `CLAUDE_PREMIUM_ENABLED=false` to ignore it on a server.

Sonnet and Opus calls use server-side refusal fallbacks. Haiku has none, so a declined Haiku request is retried once on Sonnet.

**Prompt caching.** The system prompt, and the design system plus brief for the section, sit before cache breakpoints. Repeats within 5 minutes are billed at the cache-read rate (5% of the input price on Sonnet 5.5 and Opus 5.5). The 3 designs share the design system, brief and reference images, so the browser starts the 2nd and 3rd designs 6 seconds after the 1st: a cache entry can only be read once the first request has started answering. Refinements of the same section reuse the cached context too. Check `cache_read` in the usage log.

Refinements ask Claude to return only the changed elements (a patch), which the server merges into the current design. Claude can still return a full design when a change reshapes most of it.

Every Claude call logs one line with its token counts and an estimated cost, for example:

```
[claude] design:clean model=claude-opus-5-5 in=3120 cache_read=1790 cache_write=0 out=14210 stop=end_turn 92.4s ~$0.2968
```

On Vercel, find these under the project's Logs, filtered by `[claude]`.

## Usage allowances

With Supabase set up, every Claude call is saved to `section_gen.usage_events` with its tokens (input, output, cache read, cache write), estimated cost and cache savings, per person, project, section and model. Run `supabase/usage_allowances.sql` once in the Supabase SQL editor to create the tables.

- Each person has a monthly allowance in USD, set by role: Creator $10, Designer $20, Developer $20, Reviewer $3, Admin no limit. People without a role are Creators. Admins can change the role defaults, give someone a personal allowance, and set the team budget ($200 by default).
- The header shows this month's spend. The chat warns at 70% and 90%. At 100% Claude requests pause (the API returns 402) and the person can send a **Request more**, which an admin approves or declines on the usage page. An approved amount adds to that person's limit for the month.
- `/usage` shows your own usage. Admins also see team spend against the budget, tokens and cache savings, premium (Opus) spend, alerts (people near their limit, sections regenerated many times), pending requests, people, and spend by job, model and project.
- Admins are people with the `admin` role in `section_gen.user_roles`. The first admin is superadmin@gmail.com.

If the usage tables are missing, the app keeps working and logs `[usage]` errors, without tracking or limits.

## Storage and sign-in

Projects and sections go through the `Store` interface in `src/lib/storage.ts`.

- **Shared (Supabase).** Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) to content-intake's Supabase project. Data lives in the `section_gen` schema (projects and sections tables, row-level security). People sign in with their content-intake account (email and password, or an emailed link when password login is off there); this app never creates accounts. Access is limited to emails matching a pattern in `section_gen.allowed_emails`, and the API routes check the same thing, so only members can spend Claude credits. The `section_gen` schema must be listed under *Exposed schemas* in the Supabase API settings.
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
