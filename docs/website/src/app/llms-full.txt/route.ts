import { source } from '@/lib/source';
import { getLLMText } from '@/lib/get-llm-text';
import { isReleaseNotesPage } from '@/lib/docs-open-graph';

// Resolves the response at build time so the result is written to
// `out/llms-full.txt` as a static file under `output: 'export'`.
export const dynamic = 'force-static';
export const revalidate = false;

/**
 * Generates `/llms-full.txt` at build time.
 *
 * Concatenates the processed Markdown of every page into a single dump so AI
 * agents can ingest the full documentation in one fetch.
 *
 * A line's release notes are dropped via `isReleaseNotesPage`. Release notes
 * are historical changelogs whose bulk text inflates the dump's token count
 * and dilutes an agent's reasoning without adding context needed for SDK
 * usage (QVAC-21379). The exclusion is scoped to `llms-full.txt` only:
 * release notes stay indexed in `sitemap.xml`, `llms.txt`, and per-page `.md`
 * so an agent can still fetch a specific release note on demand.
 */
export async function GET() {
  const scan = source
    .getPages()
    .filter((page) => !isReleaseNotesPage(page))
    .map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response(scanned.join('\n\n'));
}
