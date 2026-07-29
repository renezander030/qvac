import { getLLMText } from '@/lib/get-llm-text';
import { isReleaseNotesPage } from '@/lib/docs-open-graph';
import {
  lineCorpusUrl,
  pagesOfLine,
  unversionedPages,
  versionedCollections,
} from '@/lib/artifacts';

// Resolves the response at build time so the result is written to
// `out/llms-full.txt` as a static file under `output: 'export'`.
export const dynamic = 'force-static';
export const revalidate = false;

/**
 * Generates `/llms-full.txt` at build time: everything the site publishes,
 * minus the choices it cannot make for the reader.
 *
 * A versioned collection contributes its current line only. Concatenating two
 * lines of the same collection would put two releases of the same API in one
 * corpus, which is the failure the lines exist to prevent; an agent that needs
 * an older line fetches that line's own corpus, named in the header below.
 *
 * The release notes of every line are dropped. They are historical changelogs
 * whose bulk text inflates the dump's token count and dilutes an agent's
 * reasoning without adding context needed to use the release (QVAC-21379).
 * They stay indexed in `sitemap.xml`, in each line's index, and as per-page
 * Markdown, so a specific release note is still one fetch away.
 */
export async function GET() {
  const collections = versionedCollections();

  const header: string[] = [
    '# QVAC Documentation — full text',
    '',
    'Contents of this corpus:',
    '',
    '- Every page of the collections that publish no versions.',
  ];

  const versionedPages = [];
  for (const { software, path, lines } of collections) {
    const current = lines.find((line) => line.current);
    if (!current) continue;
    header.push(
      `- ${software.package} ${current.version}, the current line of ${path}. Other lines are not included here: ${lines
        .filter((line) => !line.current)
        .map((line) => `${line.version} → ${lineCorpusUrl(path, line)}`)
        .join(', ')}`,
    );
    versionedPages.push(...pagesOfLine(current));
  }

  header.push('', '- Release notes are excluded; fetch a release note as its own page.', '');

  const texts = await Promise.all(
    [...unversionedPages(), ...versionedPages]
      .filter((page) => !isReleaseNotesPage(page))
      .map(getLLMText),
  );

  return new Response([header.join('\n'), ...texts].join('\n\n'));
}
