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

/** Creative directions used to make the 3 variants clearly different. */
export const VARIANT_DIRECTIONS = [
  {
    id: "clean",
    label: "Clean & conventional",
    brief:
      "A polished, conventional layout that follows proven patterns for this business type. Prioritise clarity, scannability and conversion. Interactions are subtle and refined.",
  },
  {
    id: "editorial",
    label: "Bold & editorial",
    brief:
      "A distinctive, editorial take: confident typographic hierarchy, generous whitespace or striking contrast, an unexpected but usable layout. Still strictly on-brand and using the tokens.",
  },
  {
    id: "interactive",
    label: "Interaction-forward",
    brief:
      "Lead with interactivity: the requested interactions are central to the experience, with smooth micro-interactions and motion that reward exploration, while staying fast and accessible.",
  },
];
