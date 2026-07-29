import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const CONTENT_DIR = path.resolve(process.cwd(), 'content/docs')

// resolveIcon imports `lucide-react` which only loads in a Next.js build.
// The sidebar tree imports it transitively, so we stub it here so the test
// can exercise the real tree without pulling the icon library.
vi.mock('@/lib/resolveIcon', () => ({
  resolveIcon: () => undefined,
}))

import { buildCustomTree } from '@/lib/custom-tree'
import { DOCUMENTED_SOFTWARE } from '@/lib/versions'
import type { Node, Root } from 'fumadocs-core/page-tree'

const PAGE_EXTENSIONS = ['.mdx', '.md']

/**
 * A page tree standing in for the one Fumadocs builds, carrying an empty
 * folder per documentation line the manifest declares.
 *
 * The composition only reads a line's children out of it, and those children
 * come from `meta.json` — checked directly against the content directory
 * below, where a missing entry names itself instead of vanishing into an
 * assertion about a composed tree.
 */
function linePageTree (): Root {
  const children: Node[] = DOCUMENTED_SOFTWARE
    .filter((software) => software.kind === 'collection')
    .flatMap((software) =>
      software.versions.map((line) => ({
        type: 'folder' as const,
        $id: `root:${software.path.slice(1)}/${line.folder}`,
        name: software.package,
        children: [],
      })),
    )
  return { $id: 'root', name: 'docs', children }
}

/**
 * Walk the tree and collect every internal page URL (skip external links,
 * pages with explicit hash-only anchors stay as-is — the page is still
 * required to exist).
 */
function collectUrls (nodes: Node[]): string[] {
  const urls: string[] = []
  for (const node of nodes) {
    if (node.type === 'page') {
      if (!node.external && !node.url.startsWith('http')) {
        urls.push(node.url)
      }
    } else if (node.type === 'folder') {
      if (node.index && !node.index.external && !node.index.url.startsWith('http')) {
        urls.push(node.index.url)
      }
      urls.push(...collectUrls(node.children))
    }
  }
  return urls
}

/**
 * For a sidebar URL like `/sdk/reference/api`, the content file resolves to
 * either:
 *   - `content/docs/sdk/reference/api.mdx`, or
 *   - `content/docs/sdk/reference/api/index.mdx`
 *
 * Anchor-only URLs (`/#community`) resolve against the docs root index.
 *
 * A trailing slash is dropped first: a line entry carries one, because its
 * dotted slug (`v0.16`) needs it to resolve at the CDN.
 */
function getExpectedPaths (url: string): string[] {
  const cleanUrl = url.split('#')[0].replace(/^\//, '').replace(/\/$/, '')
  if (!cleanUrl) {
    return [path.join(CONTENT_DIR, 'index.mdx')]
  }
  return PAGE_EXTENSIONS.flatMap((extension) => [
    path.join(CONTENT_DIR, cleanUrl + extension),
    path.join(CONTENT_DIR, cleanUrl, 'index' + extension),
  ])
}

/** Every directory under `content/docs` holding a `meta.json`. */
function metaDirectories (dir = CONTENT_DIR): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...metaDirectories(path.join(dir, entry.name)))
    else if (entry.name === 'meta.json') found.push(dir)
  }
  return found
}

function readPages (dir: string): string[] {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'))
  return Array.isArray(meta.pages) ? meta.pages : []
}

const SEPARATOR = /^---(?:\[[^\]]+])?(.+)---$|^---$/
const LINK = /^(external:)?(?:\[[^\]]+])?\[[^\]]+]\(([^)]+)\)$/
const REST = new Set(['...', 'z...a'])

type Entry =
  | { kind: 'ignored' }
  | { kind: 'link', url: string }
  | { kind: 'page', name: string }
  | { kind: 'folder', name: string }

/**
 * Classify one `meta.json` entry the way Fumadocs resolves it: separators,
 * rest markers and exclusions name no content, a link names a URL, `...name`
 * names a folder whose children are spliced in, and anything else names a
 * page or a folder.
 */
function classify (entry: string): Entry {
  if (REST.has(entry) || SEPARATOR.test(entry)) return { kind: 'ignored' }

  const link = LINK.exec(entry)
  if (link) {
    const [, external, url] = link
    return external || url.startsWith('http') ? { kind: 'ignored' } : { kind: 'link', url }
  }

  if (entry.startsWith('!')) return { kind: 'ignored' }
  if (entry.startsWith('...')) return { kind: 'folder', name: entry.slice(3) }
  return { kind: 'page', name: entry }
}

function resolvesToPage (dir: string, name: string): boolean {
  return PAGE_EXTENSIONS.some((extension) => fs.existsSync(path.join(dir, name + extension)))
}

function resolvesToFolder (dir: string, name: string): boolean {
  const target = path.join(dir, name)
  return fs.existsSync(target) && fs.statSync(target).isDirectory()
}

describe('sidebar-consistency', () => {
  describe('entries declared in custom-tree', () => {
    const urls = [...new Set(collectUrls(buildCustomTree(linePageTree())))]

    it.each(urls)('has content file for %s', (url) => {
      const candidates = getExpectedPaths(url)
      const found = candidates.some((p) => fs.existsSync(p))
      expect(found, `No content file for ${url}. Checked:\n  ${candidates.join('\n  ')}`).toBe(true)
    })
  })

  describe('entries declared in meta.json', () => {
    // Each line declares its own navigation, so an entry is only ever resolved
    // against its own directory. A page one line carries and another dropped
    // is two independent declarations, and neither is measured against the
    // other.
    const declarations = metaDirectories().flatMap((dir) =>
      readPages(dir).map((entry) => ({ dir, entry })),
    )

    it.each(declarations)('resolves $entry in $dir', ({ dir, entry }) => {
      const classified = classify(entry)
      if (classified.kind === 'ignored') return

      if (classified.kind === 'link') {
        const candidates = getExpectedPaths(classified.url)
        expect(
          candidates.some((p) => fs.existsSync(p)),
          `No content file for ${classified.url}. Checked:\n  ${candidates.join('\n  ')}`,
        ).toBe(true)
        return
      }

      const relative = path.relative(CONTENT_DIR, dir)
      if (classified.kind === 'folder') {
        expect(
          resolvesToFolder(dir, classified.name),
          `meta.json in ${relative} splices "${classified.name}", which is not a folder`,
        ).toBe(true)
        return
      }

      expect(
        resolvesToPage(dir, classified.name) || resolvesToFolder(dir, classified.name),
        `meta.json in ${relative} names "${classified.name}", which is neither a page nor a folder`,
      ).toBe(true)
    })
  })

  describe('content reachable from meta.json', () => {
    // A page no navigation names belongs to no collection: the sidebar falls
    // back to listing the collections, and the reader lands somewhere that
    // looks like a different site. Where a directory declares its pages, it
    // must declare all of them.
    const directories = metaDirectories()

    it.each(directories)('names every page and folder in %s', (dir) => {
      const entries = readPages(dir)
      if (entries.length === 0) return

      const named = new Set(
        entries.flatMap((entry) => {
          const classified = classify(entry)
          return classified.kind === 'page' || classified.kind === 'folder'
            ? [classified.name]
            : []
        }),
      )
      // An exclusion is a deliberate omission, and the index of a folder that
      // is not a root is lifted out of the list by Fumadocs itself.
      for (const entry of entries) {
        if (entry.startsWith('!')) named.add(entry.slice(1))
      }
      named.add('index')

      const missing = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((child) =>
          child.isDirectory() ||
          PAGE_EXTENSIONS.includes(path.extname(child.name)),
        )
        .map((child) =>
          child.isDirectory() ? child.name : path.basename(child.name, path.extname(child.name)),
        )
        .filter((name) => !named.has(name))

      expect(
        missing,
        `Unlisted in ${path.relative(CONTENT_DIR, dir)}/meta.json: ${missing.join(', ')}`,
      ).toEqual([])
    })
  })
})
