import { source } from '@/lib/source';
import { buildCanonicalDocsUrl } from '@/lib/docs-open-graph';
import { collectionTabs } from '@/lib/custom-tree';
import { getVersionForPath, isCurrentLineFolder } from '@/lib/versions';
import type { InferPageType } from 'fumadocs-core/source';

/**
 * The Markdown the site publishes for a page, with what an agent needs to
 * know about where the page comes from.
 *
 * The metadata is derived from the page's URL, never from its front matter:
 * moving a page into another line changes what its Markdown states, with no
 * edit to the page. A page of a collection that publishes no lines declares
 * no line, which is how an agent tells "this applies to every release" from
 * "this applies to v0.16".
 */
export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed');
  const front = frontMatter(page);

  return `---
${front.join('\n')}
---

# ${page.data.title} (${page.url})

${processed}`;
}

function frontMatter(page: InferPageType<typeof source>): string[] {
  const fields = [
    `title: ${JSON.stringify(page.data.title)}`,
    `canonical: ${buildCanonicalDocsUrl(page.slugs)}`,
  ];

  const collection = collectionTabs.find(
    (tab) => page.url === tab.url || page.url.startsWith(`${tab.url}/`),
  );
  if (collection) fields.push(`collection: ${JSON.stringify(collection.title)}`);

  // Only a collection published as documentation lines states one. An
  // inventory package under Platform carries versions of its own, but those
  // are releases of a package catalogued page by page, not lines of
  // documentation, and an agent must not read them as such.
  const versioned = getVersionForPath(page.url);
  if (versioned && versioned.software.kind === 'collection') {
    fields.push(
      `package: ${JSON.stringify(versioned.software.package)}`,
      `line: ${versioned.version.version}`,
      `current_line: ${isCurrentLineFolder(versioned.version.folder)}`,
    );
  }

  return fields;
}
