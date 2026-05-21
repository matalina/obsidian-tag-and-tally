// Canonical Fuse configuration for the Tag & Tally docs search index.
// The docs site mirrors this inline in packages/docs/_includes/footer.njk
// (Eleventy has no bundler). Keep the two in sync when tuning.
//
// The slugify here must also match scripts/generate-search-index.ts and
// packages/docs/modules/markdown.js so URL fragments resolve correctly.

import Fuse, { type IFuseOptions } from "fuse.js";

export interface SearchEntry {
  title: string;
  pageTitle: string;
  breadcrumb: string;
  url: string;
  content: string;
  description: string;
  headingLevel: 1 | 2 | 3;
  fileSlug: string;
}

export const DOCS_FUSE_OPTIONS: IFuseOptions<SearchEntry> = {
  keys: [
    { name: "breadcrumb", weight: 0.5 },
    { name: "title", weight: 0.3 },
    { name: "pageTitle", weight: 0.15 },
    { name: "content", weight: 0.1 },
    { name: "fileSlug", weight: 0.05 },
  ],
  threshold: 0.3,
  includeScore: true,
  minMatchCharLength: 2,
  ignoreLocation: true,
  useExtendedSearch: true,
  findAllMatches: false,
};

export function createDocsFuse(entries: SearchEntry[]): Fuse<SearchEntry> {
  return new Fuse(entries, DOCS_FUSE_OPTIONS);
}

export function slugifyHeading(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]+/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
