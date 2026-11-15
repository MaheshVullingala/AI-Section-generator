import type { Question } from "./types";

export const BUSINESS_TYPES = [
  "SaaS / software",
  "E-commerce / retail",
  "Agency / studio",
  "Restaurant / food & beverage",
  "Healthcare / clinic",
  "Fintech / banking",
  "Education / e-learning",
  "Real estate",
  "Events / conferences",
  "Travel / hospitality",
  "Fitness / wellness",
  "Non-profit",
  "Professional services (legal, consulting)",
  "Mobile app",
  "Hardware / physical product",
  "Other",
];

export const INTERACTIONS = [
  "Hover and focus states",
  "Scroll reveal animations",
  "Tabs",
  "Accordion",
  "Carousel / slider",
  "Toggle (e.g. monthly / yearly)",
  "Animated counters",
  "Modal / lightbox",
  "Filterable grid",
  "Before / after comparison",
  "Parallax / depth",
  "Form with inline validation",
];

const common: Question[] = [
  { id: "goal", label: "Primary goal of this section", type: "text", placeholder: "e.g. get sign-ups for the free trial" },
  { id: "audience", label: "Who is the audience?", type: "text", placeholder: "e.g. HR managers at mid-size companies" },
  { id: "tone", label: "Tone", type: "select", options: ["Professional", "Friendly", "Playful", "Luxury", "Bold", "Minimal", "Technical"] },
  { id: "layout", label: "Layout preference", type: "select", options: ["No preference", "Centered", "Split (text + media)", "Grid / cards", "Full-bleed media", "Asymmetric"] },
];

export const SECTION_TYPES: Record<string, Question[]> = {
  Hero: [
    { id: "headline", label: "Headline (or leave blank to generate)", type: "text" },
    { id: "media", label: "Media", type: "select", options: ["Product screenshot", "Photo", "Illustration", "Video background", "Abstract / gradient", "None"] },
    { id: "ctaCount", label: "Number of CTAs", type: "select", options: ["1", "2"] },
    { id: "social", label: "Include social proof (logos, rating, stats)?", type: "boolean" },
  ],
  Features: [
    { id: "count", label: "How many features?", type: "number", placeholder: "e.g. 6" },
    { id: "presentation", label: "Presentation", type: "select", options: ["Icon grid", "Alternating rows", "Tabs", "Bento grid", "Accordion with image"] },
    { id: "icons", label: "Use icons?", type: "boolean" },
  ],
  Pricing: [
    { id: "tiers", label: "Number of tiers", type: "number", placeholder: "e.g. 3" },
    { id: "billingToggle", label: "Monthly / yearly toggle?", type: "boolean" },
    { id: "highlight", label: "Which plan to highlight?", type: "text", placeholder: "e.g. Pro" },
    { id: "currency", label: "Currency", type: "text", placeholder: "e.g. USD, INR, EUR" },
    { id: "comparison", label: "Include a feature comparison table?", type: "boolean" },
  ],
  Testimonials: [
    { id: "count", label: "How many testimonials?", type: "number" },
    { id: "format", label: "Format", type: "select", options: ["Carousel", "Grid", "Masonry wall", "Single featured quote", "Video testimonials"] },
    { id: "ratings", label: "Show star ratings?", type: "boolean" },
  ],
  FAQ: [
    { id: "count", label: "How many questions?", type: "number" },
    { id: "format", label: "Format", type: "select", options: ["Accordion", "Two-column", "Tabs by category"] },
    { id: "contact", label: "Include a 'still have questions' CTA?", type: "boolean" },
  ],
  "Call to action": [
    { id: "offer", label: "What's the offer?", type: "text", placeholder: "e.g. 14-day free trial, no card" },
    { id: "capture", label: "Capture method", type: "select", options: ["Button only", "Email field + button", "Two buttons"] },
  ],
  "Product showcase": [
    { id: "products", label: "How many products / items?", type: "number" },
    { id: "details", label: "Details to show", type: "text", placeholder: "price, rating, variants, badges..." },
    { id: "action", label: "Primary action", type: "select", options: ["Add to cart", "View details", "Book / reserve", "Enquire"] },
  ],
  "Comparison table": [
    { id: "columns", label: "What is being compared?", type: "text", placeholder: "e.g. us vs 2 competitors" },
    { id: "rows", label: "Number of rows / criteria", type: "number" },
  ],
  "Stats / metrics": [
    { id: "count", label: "How many stats?", type: "number" },
    { id: "animate", label: "Animate numbers on scroll?", type: "boolean" },
  ],
  "Timeline / process": [
    { id: "steps", label: "How many steps?", type: "number" },
    { id: "orientation", label: "Orientation", type: "select", options: ["Horizontal", "Vertical", "Auto (horizontal on desktop)"] },
  ],
  Team: [
    { id: "count", label: "How many people?", type: "number" },
    { id: "details", label: "Details per person", type: "text", placeholder: "photo, role, bio, socials..." },
  ],
  Gallery: [
    { id: "count", label: "How many images?", type: "number" },
    { id: "style", label: "Style", type: "select", options: ["Masonry", "Uniform grid", "Carousel", "Filterable grid"] },
    { id: "lightbox", label: "Open images in a lightbox?", type: "boolean" },
  ],
  "Contact / lead form": [
    { id: "fields", label: "Fields", type: "text", placeholder: "name, email, company, message..." },
    { id: "endpoint", label: "Form action URL (optional)", type: "text" },
    { id: "extras", label: "Show contact details or map?", type: "boolean" },
  ],
  Custom: [{ id: "describe", label: "Describe the section", type: "textarea" }],
};

export function questionsFor(sectionType: string): Question[] {
  return [...common, ...(SECTION_TYPES[sectionType] ?? SECTION_TYPES.Custom)];
}

/** Interaction patterns that suit each business type, used to steer generation. */
const INTERACTION_GUIDANCE: Record<string, string> = {
  "SaaS / software":
    "tabs or a stepper that walks through product features, a monthly/yearly pricing toggle, product UI screenshots that lift or reveal detail on hover, staggered scroll reveals, animated metrics for social proof.",
  "E-commerce / retail":
    "image swap or quick-view on product hover, colour/variant swatches that update the image, an add-to-cart micro-interaction, a swipeable product carousel, filter chips.",
  "Agency / studio":
    "bold, expressive hover reveals on work tiles, cursor-aware or layered depth effects on desktop, large typographic motion on scroll, a filterable case-study grid.",
  "Restaurant / food & beverage":
    "menu category tabs, an appetising image gallery with a lightbox, a sticky reserve CTA with a gentle pulse on hover, warm fade-in reveals.",
  "Healthcare / clinic":
    "calm, minimal motion; clear accordions for services and FAQs; large focus states; trust indicators that fade in. Avoid anything flashy.",
  "Fintech / banking":
    "animated counters and figures for trust, a calculator or toggle that shows outcomes, precise tabular data with hover highlighting, restrained and confident transitions.",
  "Education / e-learning":
    "course or curriculum tabs, accordions for modules, a progress or step timeline, hover previews on course cards.",
  "Real estate":
    "a swipeable property gallery with a lightbox, filter chips for listing types, hover details on listing cards, a before/after or map-style reveal.",
  "Events / conferences":
    "schedule tabs by day or track, a speaker grid with hover bios, a countdown or animated stats, a sticky register CTA.",
  "Travel / hospitality":
    "an immersive image carousel, destination cards with hover zoom and details, tabs for room or package types, parallax depth on desktop.",
  "Fitness / wellness":
    "energetic hover states on class or plan cards, a schedule filter, animated progress or stat counters, a membership toggle.",
  "Non-profit":
    "animated impact counters, a story carousel, donation amount toggles with clear selected states, warm scroll reveals.",
  "Professional services (legal, consulting)":
    "restrained hover states, service accordions, a process timeline that reveals step by step, testimonial carousel. Keep motion subtle and credible.",
  "Mobile app":
    "a device mockup that swaps screens via tabs or scroll, feature hover highlights, app-store CTA micro-interactions, animated ratings.",
  "Hardware / physical product":
    "hotspots or tabs that highlight product parts, a spec comparison toggle, a 360-style image carousel, before/after comparison.",
};

export function interactionGuidance(businessType: string): string {
  return (
    INTERACTION_GUIDANCE[businessType] ??
    "interactions that make the content easier to explore (tabs, accordions, carousels) plus polished hover, focus and scroll-reveal feedback."
  );
}

/** Creative directions used to make the 3 variants clearly different, including how much motion each uses. */
export const VARIANT_DIRECTIONS = [
  {
    id: "clean",
    label: "Clean & conventional",
    brief:
      "A polished, conventional layout that follows proven patterns for this business type. Prioritise clarity, scannability and conversion. Motion level: subtle. Refined hover and focus states, a light staggered scroll reveal, and every requested interaction implemented cleanly.",
  },
  {
    id: "editorial",
    label: "Bold & editorial",
    brief:
      "A distinctive, editorial take: confident typographic hierarchy, generous whitespace or striking contrast, an unexpected but usable layout. Motion level: expressive but purposeful. Typography and imagery animate in with character, hovers reveal extra detail, and every requested interaction is styled to match the editorial look. Still strictly on-brand and using the tokens.",
  },
  {
    id: "interactive",
    label: "Interaction-forward",
    brief:
      "Lead with interactivity: the requested interactions are the centrepiece of the experience, and you add the most fitting extra interaction from the business guidance. Motion level: rich. Layered micro-interactions, state changes that animate smoothly, and content that rewards exploration, while staying fast, keyboard friendly and fully usable with reduced motion.",
  },
];
