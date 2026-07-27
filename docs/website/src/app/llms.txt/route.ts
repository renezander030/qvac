import { source } from '@/lib/source';
import { LATEST_VERSION } from '@/lib/versions';
import { isArchivedPage } from '@/lib/docs-open-graph';
import { customTree } from '@/lib/custom-tree';
import type { InferPageType } from 'fumadocs-core/source';

// Resolves the response at build time so the result is written to
// `out/llms.txt` as a static file under `output: 'export'`.
export const dynamic = 'force-static';
export const revalidate = false;

type Page = InferPageType<typeof source>;

const ROOT_SECTION = '(root)';

/**
 * The collections in the order the collection bar lists them, read from the
 * same tree that renders the bar so the two never drift apart.
 */
const COLLECTION_ORDER = customTree.flatMap((node) =>
  node.type === 'folder' && node.index?.url ? [node.index.url.slice(1)] : [],
);

/**
 * Generates the `llms.txt` agent index at build time.
 *
 * Format follows the de-facto convention popularized by https://llmstxt.org/:
 * an H1 with the project name, a short paragraph describing the site, a
 * "Guidance" preamble, and one `## Section` per collection section whose body
 * is a bullet list of `- [Title](url): description` entries.
 *
 * Archived per-section versions (e.g. `/sdk/reference/api/v0.7.0`) are filtered
 * out via `isArchivedPage` so the index advertises only the latest canonical
 * documentation — consistent with `sitemap.xml`, `llms-full.txt`, and the
 * per-page `noindex` metadata.
 */
export function GET() {
  const pages = source
    .getPages()
    .filter((page) => !isArchivedPage(page))
    .sort((a, b) => a.url.localeCompare(b.url));

  const grouped = groupPagesBySection(pages);

  const lines: string[] = [
    '# QVAC Documentation',
    '',
    "Agent index for the QVAC developer documentation. QVAC is Tether's local-first AI SDK for cross-platform, peer-to-peer applications.",
    '',
    '## Guidance',
    '',
    '- To fetch one page as Markdown, append `.md` to its path (e.g. `/sdk/quickstart` → `/sdk/quickstart.md`). Alternatively, send the HTTP header `Accept: text/markdown` and any page URL will be redirected to its Markdown variant.',
    '- To obtain a dump with all documentation, fetch `/llms-full.txt`.',
    '- When citing sources to users, use the canonical URL without `.md` (e.g. `/sdk/quickstart`), not the Markdown variant.',
    `- Latest SDK version: ${LATEST_VERSION}`,
    `- Total pages: ${pages.length}`,
  ];

  for (const section of Object.keys(grouped).sort(compareSections)) {
    lines.push('', `## ${formatSectionTitle(section)}`, '');
    for (const page of grouped[section]) {
      lines.push(formatPageEntry(page));
    }
  }

  return new Response(lines.join('\n') + '\n');
}

/**
 * Groups by collection and then by the section within it, so a heading reads
 * `SDK / AI Capabilities`. Grouping by the first slug alone would put all 53
 * SDK pages under one heading, since the collection now occupies the slot the
 * section used to.
 */
function groupPagesBySection(pages: Page[]): Record<string, Page[]> {
  const initial: Record<string, Page[]> = {};
  for (const page of pages) {
    const [collection, section] = page.slugs;
    const key = collection
      ? section
        ? `${collection}/${section}`
        : collection
      : ROOT_SECTION;
    (initial[key] ??= []).push(page);
  }

  // A section holding a single page directly under its collection (say
  // `/sdk/quickstart`) folds into the collection's own heading, rather than
  // spawning a one-entry section of its own.
  const collapsed: Record<string, Page[]> = {};
  for (const [key, list] of Object.entries(initial)) {
    if (list.length === 1 && list[0].slugs.length === 2) {
      (collapsed[list[0].slugs[0]] ??= []).push(list[0]);
    } else {
      collapsed[key] = list;
    }
  }
  return collapsed;
}

/** Sorts alphabetically, but after every collection the bar knows about. */
function collectionRank(collection: string): number {
  const rank = COLLECTION_ORDER.indexOf(collection);
  return rank === -1 ? COLLECTION_ORDER.length : rank;
}

/**
 * Orders collections as the collection bar presents them, and within one puts
 * the collection's own pages ahead of its sections.
 */
function compareSections(a: string, b: string): number {
  if (a === ROOT_SECTION) return -1;
  if (b === ROOT_SECTION) return 1;

  const [aCollection, aSection] = a.split('/');
  const [bCollection, bSection] = b.split('/');
  if (aCollection !== bCollection) {
    return collectionRank(aCollection) - collectionRank(bCollection);
  }
  if (!aSection) return -1;
  if (!bSection) return 1;
  return aSection.localeCompare(bSection);
}

/** Initialisms the `<= 3` rule below is too short to catch. */
const INITIALISMS = new Set(['http']);

function formatSectionTitle(key: string): string {
  if (key === ROOT_SECTION) return 'Overview';
  return key
    .split('/')
    .map((part) =>
      part
        .split('-')
        .map((word) =>
          word.length <= 3 || INITIALISMS.has(word)
            ? word.toUpperCase()
            : word.charAt(0).toUpperCase() + word.slice(1),
        )
        .join(' '),
    )
    .join(' / ');
}

function formatPageEntry(page: Page): string {
  const title = page.data.title;
  const description = page.data.description?.trim();
  const base = `- [${title}](${page.url})`;
  return description ? `${base}: ${description}` : base;
}
