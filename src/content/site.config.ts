/**
 * SINGLE SOURCE OF TRUTH for every piece of personal content on the site.
 *
 * Rules:
 *  - Unknown values stay `null`. Any UI that depends on a `null` value is omitted
 *    (no placeholder links, no "coming soon" buttons).
 *  - Only state facts. Nothing here is invented: no metrics, clients, awards,
 *    deployments or screenshots.
 *  - To add contact links, replace `null` with the real value. The Contact
 *    scene adapts its button arc to however many links are non-null (0–5).
 */

export type Url = string | null;

export interface PanelContent {
  id: string;
  title: string;
  /** 2–4 short sentences. Wrapped automatically on the 3D panel. */
  body: string;
}

export interface Project {
  /** URL segment: /work/<slug>/ and folder name in public/assets/projects/<slug>/ */
  slug: string;
  title: string;
  descriptor: string;
  /** Shown as a small tag, e.g. "Team project", "Concept". */
  tags: string[];
  overview: string;
  role: string;
  tech: string[];
  /** Only what is actually implemented. */
  features: string[];
  /** Explicitly labelled "Future direction" in the UI. null = section omitted. */
  future: string | null;
  repo: Url;
  live: Url;
  /** Optional video in public/assets/projects/<slug>/, e.g. "preview.mp4". */
  video: string | null;
}

export interface ContactLinks {
  /** Plain address, e.g. "name@example.com" (rendered as mailto:). */
  email: string | null;
  github: Url;
  linkedin: Url;
  instagram: Url;
  x: Url;
}

export interface SiteConfig {
  person: {
    name: string;
    firstName: string;
    lastName: string;
    focus: string;
    education: string;
    internship: string;
    roles: string[];
    subtitle: string;
  };
  meta: { title: string; description: string };
  about: { intro: PanelContent; panels: PanelContent[] };
  projects: Project[];
  contact: { bannerLines: [string, string]; links: ContactLinks };
}

export const site: SiteConfig = {
  person: {
    name: 'Asimangkan Boro',
    firstName: 'Asimangkan',
    lastName: 'Boro',
    focus: 'Software Development',
    education:
      'B.Tech, Computer Science & Engineering — Jorhat Engineering College, Assam (final year)',
    internship: 'Frint.in',
    roles: [
      'GDGC-JEC Organiser',
      'GLUG-JEC Club Advisor',
      'General Sports Secretary, JECSU 2026–27',
    ],
    subtitle: 'Software Developer · CSE @ Jorhat Engineering College',
  },

  meta: {
    title: 'Asimangkan Boro — Software Developer',
    description:
      'Asimangkan Boro, computer science student at Jorhat Engineering College. Web experiences, practical AI and community.',
  },

  about: {
    intro: {
      id: 'about-me',
      title: 'About Me',
      body:
        "I'm Asimangkan Boro, a computer science student at Jorhat Engineering College. I build web experiences, explore practical applications of AI, and bring people together through technology and sport.",
    },
    panels: [
      {
        id: 'software-development',
        title: 'Software Development',
        body:
          'Final-year B.Tech CSE student. I mostly build for the web with TypeScript, React and Next.js, and I like turning a rough idea into a prototype people can actually click through.',
      },
      {
        id: 'campus-spatial',
        title: 'Campus & Spatial Experiences',
        body:
          'JEC Maps started as a way to find your way around our campus: a MapLibre map with building outlines, paths and search. I want to take it towards a 3D digital twin of the campus.',
      },
      {
        id: 'ai-security',
        title: 'AI & Security Exploration',
        body:
          "I'm exploring practical uses of AI rather than demos. With my final-year team I'm working on M-PHISH, a prototype that explains why a website may be risky before you trust it.",
      },
      {
        id: 'community-leadership',
        title: 'Community & Leadership',
        body:
          'Organiser at GDGC-JEC and Club Advisor at GLUG-JEC, helping run the developer and open-source communities on our campus.',
      },
      {
        id: 'beyond-the-screen',
        title: 'Beyond the Screen',
        body:
          'General Sports Secretary of JECSU for 2026–27. Sport is where I learned teamwork, and I try to bring the same energy to the communities I am part of.',
      },
    ],
  },

  projects: [
    {
      slug: 'jecverse',
      title: 'JEC Maps / JECVERSE',
      descriptor: 'Campus navigation for Jorhat Engineering College',
      tags: ['Campus navigation'],
      overview:
        'A web map of the JEC campus built on MapLibre GL. It draws the campus boundary, building footprints and walking paths from GeoJSON, and lets you search for a place and fly straight to it.',
      role: 'Design and development.',
      tech: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'MapLibre GL'],
      features: [
        'Campus boundary, building and walking-path layers rendered from GeoJSON',
        'Place search with fly-to and popups',
        'A small place-editor helper that turns a clicked map point into a data entry',
        'An experimental Three.js marker drawn as a MapLibre custom layer',
      ],
      future:
        'A 3D digital twin of the campus — explorable buildings and routes in three dimensions. Not built yet.',
      repo: 'https://github.com/MenthoPLuss/jec-maps.git',
      live: null,
      video: null,
    },
    {
      slug: 'plugora',
      title: 'Plugora',
      descriptor: 'Peer-to-peer EV home-charger sharing — a concept',
      tags: ['Concept'],
      overview:
        'A concept for letting EV owners share their home chargers with people nearby. The current prototype is a single landing page with a sample list of chargers that you can filter by vehicle type and search by area. It is not a production product.',
      role: 'Concept and front-end prototype.',
      tech: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS'],
      features: [
        'Landing page explaining the idea',
        'Sample charger listings with power rating, price and availability',
        'Filtering by vehicle type and search over the sample list',
      ],
      future:
        'Charger discovery on a map, listings managed by charger owners, and slot booking. These are product direction, not implemented features.',
      repo: null,
      live: null,
      video: null,
    },
    {
      slug: 'm-phish',
      title: 'M-PHISH',
      descriptor: 'Final-year team project — contextual website-risk checks',
      tags: ['Team project', 'Final year', 'Prototype'],
      overview:
        'A prototype that helps people decide whether to trust a website. It combines URL signals, page observations and contextual relationships into a transparent risk assessment with plain-language guidance. It is a prototype, not a malware scanner or a guarantee of safety.',
      role: 'Member of the final-year project team.',
      tech: [
        'Python',
        'FastAPI',
        'SQLite',
        'Alembic',
        'Next.js',
        'TypeScript',
        'Chromium extension (MV3)',
      ],
      features: [
        'Two-stage flow: a fast URL-only check, with a deeper investigation for medium, high or uncertain results',
        'Deterministic risk scoring with evidence items, a timeline and a context graph',
        'Next.js dashboard for reviewing investigations and reports',
        'Chromium extension that checks top-level navigations',
        'Target restrictions (HTTP/HTTPS only, private addresses rejected), rate limiting, API and security tests',
        'Optional LLM wording of the evidence, with an automatic non-AI fallback',
      ],
      future:
        'Isolated remote crawling, DNS enrichment and ML inference are extension points in the codebase, not finished features.',
      repo: 'https://github.com/riiiituraaj/M-PHISH.git',
      live: null,
      video: null,
    },
    {
      slug: 'tender-ai',
      title: 'tender.ai',
      descriptor: 'Team internship project at Frint.in — tender discovery & RFP analysis',
      tags: ['Team project', 'Internship · Frint.in'],
      overview:
        'A collaborative industrial internship project at Frint.in: a platform for discovering Indian public-procurement tenders (GeM and Assam e-Procurement) and analysing tender documents with an LLM-backed service. Built by a team.',
      role: 'Intern on the Frint.in project team.',
      tech: [
        'Node.js',
        'Express',
        'MongoDB',
        'Redis',
        'Puppeteer',
        'React',
        'Vite',
        'Python',
        'FastAPI',
      ],
      features: [
        'Scrapers for GeM and Assam e-Procurement listings, with a simulation mode',
        'REST API with authentication, caching and rate limiting',
        'Email alerts for new tenders',
        'React front end with search and an AI copilot drawer',
        'AI service routes for RFP analysis, eligibility checks, recommendations and bid estimates',
      ],
      future: null,
      repo: 'https://github.com/Souvik16-Js/tender.ai.whole.git',
      live: null,
      video: null,
    },
  ],

  contact: {
    bannerLines: ['Have something interesting in mind?', "Let's build it."],
    links: {
      email: null,
      github: null,
      linkedin: null,
      instagram: null,
      x: null,
    },
  },
};
