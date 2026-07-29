/**
 * The version manifest: every piece of software this site documents at more
 * than one version, the package it is, where it is documented, and the
 * versions published for it.
 *
 * Hand-edited. Publishing a version is two edits in one reviewable diff — the
 * folder under `content/docs/`, and the entry here — and the structure check
 * in `tests/line-structure.test.ts` fails the build when the two disagree.
 *
 * A version records its number and the folder holding it, and nothing else.
 * Whether a versioned collection's line is the current one is read from the
 * folder: the current line is written `(v0.17)`, a Fumadocs folder group
 * excluded from the slug, and every other line `v0.16`. Currency is therefore
 * stated once, in the one place that also determines the URLs.
 *
 * Inventory packages declare no current version. Their version-less path
 * belongs to the package index, so every README sits at a versioned path and
 * no folder group appears anywhere in the inventory.
 */

/** A documentation line or package version: major and minor, never a patch. */
export type VersionNumber = `v${number}.${number}`;

/** The folder holding a version. Parenthesized when the line is current. */
export type VersionFolder = VersionNumber | `(${VersionNumber})`;

export interface DocumentedVersion {
  version: VersionNumber;
  folder: VersionFolder;
}

/**
 * `collection` — a product collection versioned as a whole, publishing one
 * current line and one older line. `package` — an inventory entry publishing
 * one page per release, with no current version.
 */
export type DocumentedSoftwareKind = 'collection' | 'package';

export interface DocumentedSoftware {
  /** The name the package publishes under, in its own registry. */
  package: string;
  kind: DocumentedSoftwareKind;
  /** Where it is documented, absolute and without a trailing slash. */
  path: `/${string}`;
  versions: readonly DocumentedVersion[];
}

/**
 * The SDK collection tracks `@qvac/sdk` and the Provider collection tracks
 * `@qvac/cli`, which implements the OpenAI-compatible HTTP server it
 * documents.
 *
 * The inventory publishes the two most recent releases of each package. The
 * Python client carries no version of its own — `pyproject.toml` stamps it
 * from `packages/sdk/package.json` — so it takes the SDK's numbers.
 */
export const DOCUMENTED_SOFTWARE = [
  {
    package: '@qvac/sdk',
    kind: 'collection',
    path: '/sdk',
    versions: [
      { version: 'v0.17', folder: '(v0.17)' },
      { version: 'v0.16', folder: 'v0.16' },
    ],
  },
  {
    package: '@qvac/cli',
    kind: 'collection',
    path: '/provider',
    versions: [
      { version: 'v0.9', folder: '(v0.9)' },
      { version: 'v0.8', folder: 'v0.8' },
    ],
  },
  {
    package: '@qvac/sdk',
    kind: 'package',
    path: '/platform/inventory/sdk',
    versions: [
      { version: 'v0.17', folder: 'v0.17' },
      { version: 'v0.16', folder: 'v0.16' },
    ],
  },
  {
    package: 'tetherto-qvac-sdk',
    kind: 'package',
    path: '/platform/inventory/sdk-python',
    versions: [
      { version: 'v0.17', folder: 'v0.17' },
      { version: 'v0.16', folder: 'v0.16' },
    ],
  },
  {
    package: '@qvac/cli',
    kind: 'package',
    path: '/platform/inventory/cli',
    versions: [
      { version: 'v0.9', folder: 'v0.9' },
      { version: 'v0.8', folder: 'v0.8' },
    ],
  },
  {
    package: '@qvac/ai-sdk-provider',
    kind: 'package',
    path: '/platform/inventory/ai-sdk-provider',
    versions: [
      { version: 'v0.4', folder: 'v0.4' },
      { version: 'v0.3', folder: 'v0.3' },
    ],
  },
] as const satisfies readonly DocumentedSoftware[];

/** True when the folder is written as a Fumadocs folder group. */
export function isCurrentLineFolder(folder: string): boolean {
  return folder.startsWith('(') && folder.endsWith(')');
}

/** The version a folder holds, whether or not the folder is a group. */
export function versionOfFolder(folder: string): string {
  return isCurrentLineFolder(folder) ? folder.slice(1, -1) : folder;
}

/** Every documented software of the given kind. */
export function documentedSoftwareOfKind(
  kind: DocumentedSoftwareKind,
): readonly DocumentedSoftware[] {
  return DOCUMENTED_SOFTWARE.filter((software) => software.kind === kind);
}

/**
 * The software documented at the given pathname, or `null` when the pathname
 * documents none. The longest matching path wins, so an inventory package
 * inside Platform resolves to the package rather than to Platform.
 */
export function getDocumentedSoftware(
  pathname: string,
): DocumentedSoftware | null {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const matches = DOCUMENTED_SOFTWARE.filter(
    (software) =>
      normalized === software.path ||
      normalized.startsWith(software.path + '/'),
  );
  if (matches.length === 0) return null;
  return matches.reduce((longest, software) =>
    software.path.length > longest.path.length ? software : longest,
  );
}

/** The versions published for a software, in the order the manifest lists. */
export function getPublishedVersions(
  software: DocumentedSoftware,
): readonly DocumentedVersion[] {
  return software.versions;
}

/**
 * The current line of a versioned collection: the entry whose folder is a
 * group. `null` for an inventory package, which declares no current version.
 */
export function getCurrentLine(
  software: DocumentedSoftware,
): DocumentedVersion | null {
  return (
    software.versions.find((entry) => isCurrentLineFolder(entry.folder)) ?? null
  );
}

/**
 * The version a page belongs to, read from its URL. A path carrying a version
 * segment resolves to that version; a path without one resolves to the current
 * line, which is why only a versioned collection can answer it.
 */
export function getVersionForPath(pathname: string): {
  software: DocumentedSoftware;
  version: DocumentedVersion;
} | null {
  const software = getDocumentedSoftware(pathname);
  if (!software) return null;

  const normalized = pathname.replace(/\/+$/, '') || '/';
  const tail = normalized.slice(software.path.length).replace(/^\/+/, '');
  const segment = tail.split('/')[0];

  const explicit = software.versions.find(
    (entry) => entry.version === segment && !isCurrentLineFolder(entry.folder),
  );
  if (explicit) return { software, version: explicit };

  const current = getCurrentLine(software);
  return current ? { software, version: current } : null;
}

/** True when the pathname falls inside a collection published as lines. */
export function isVersionedCollectionPath(pathname: string): boolean {
  return getDocumentedSoftware(pathname)?.kind === 'collection';
}

/**
 * Build the URL for a version of something published at `basePath`. The
 * version served without a segment — a collection's current line — maps to
 * `basePath/`; every other version maps to `basePath/<version>/`. Pass
 * `null` as `versionlessVersion` where no version is served bare, which is
 * every inventory package.
 *
 * Trailing slash is mandatory: versioned slugs contain dots, and Sevalla's
 * Pretty URLs treats a slash-less dotted final segment as a file request and
 * 404s it before `_redirects` runs, so the slash-less→with-slash
 * normalization never fires for them. Emitting the trailing-slash form
 * directly lands on the `200` rewrite (see `public/_redirects`).
 */
export function computeSectionVersionUrl(
  basePath: string,
  targetVersion: string,
  versionlessVersion: string | null,
): string {
  if (versionlessVersion !== null && targetVersion === versionlessVersion) {
    return `${basePath}/`;
  }
  return `${basePath}/${targetVersion}/`;
}

/* -------------------------------------------------------------------------
 * Patch-series sections — superseded, still serving.
 *
 * The SDK API summary and release notes keep their own patch-series archives
 * (`v0.15.x.mdx` siblings) until the archives are retired and the line
 * switcher replaces `VersionSelector`. Everything below goes with them.
 * ---------------------------------------------------------------------- */

export interface VersionEntry {
  label: string;
  value: string;
  isLatest?: boolean;
}

export interface VersionedSection {
  basePath: string;
  /**
   * Precise current patch (e.g. `v0.11.3`). Used by page renderers to
   * advertise the latest-patch number in titles / description ranges.
   * Not used for URL routing — that goes through `latestSeries`.
   */
  latest: string;
  /**
   * Series form of the current latest minor (e.g. `v0.11.x`). This is
   * the URL slug + version-selector value of the (latest) entry, and
   * the path `index.mdx` is served from at the bare `basePath`.
   */
  latestSeries: string;
  versions: VersionEntry[];
}

export const API_SECTION: VersionedSection = {
  basePath: '/sdk/reference/api',
  latest: 'v0.16.0',
  latestSeries: 'v0.16.x',
  versions: [
    { label: 'v0.16.x (latest)', value: 'v0.16.x', isLatest: true },
    { label: 'v0.15.x', value: 'v0.15.x' },
    { label: 'v0.14.x', value: 'v0.14.x' },
    { label: 'v0.13.x', value: 'v0.13.x' },
    { label: 'v0.12.x', value: 'v0.12.x' },
    { label: 'v0.11.x', value: 'v0.11.x' },
    { label: 'v0.10.x', value: 'v0.10.x' },
    { label: 'v0.9.x', value: 'v0.9.x' },
    { label: 'v0.8.x', value: 'v0.8.x' },
  ],
};

export const RELEASE_NOTES_SECTION: VersionedSection = {
  basePath: '/sdk/reference/release-notes',
  latest: 'v0.16.0',
  latestSeries: 'v0.16.x',
  versions: [
    { label: 'v0.16.x (latest)', value: 'v0.16.x', isLatest: true },
    { label: 'v0.15.x', value: 'v0.15.x' },
    { label: 'v0.14.x', value: 'v0.14.x' },
    { label: 'v0.13.x', value: 'v0.13.x' },
    { label: 'v0.12.x', value: 'v0.12.x' },
    { label: 'v0.11.x', value: 'v0.11.x' },
    { label: 'v0.10.x', value: 'v0.10.x' },
    { label: 'v0.9.x', value: 'v0.9.x' },
    { label: 'v0.8.x', value: 'v0.8.x' },
  ],
};

const VERSIONED_SECTIONS: VersionedSection[] = [
  API_SECTION,
  RELEASE_NOTES_SECTION,
];

/**
 * Re-exported for backward compatibility with consumers that advertise the
 * latest SDK version in plain text (e.g. the `llms.txt` route). Carries
 * the precise patch number, not the series.
 */
export const LATEST_VERSION = API_SECTION.latest;

/**
 * Return the versioned section the given pathname falls under, or `null`
 * when the pathname is not within any versioned section.
 */
export function getVersionedSection(
  pathname: string,
): VersionedSection | null {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return (
    VERSIONED_SECTIONS.find(
      (section) =>
        normalized === section.basePath ||
        normalized.startsWith(section.basePath + '/'),
    ) ?? null
  );
}

/**
 * Extract the current series slug from a versioned-section pathname.
 * Returns `section.latestSeries` when on the bare `basePath`
 * (`index.mdx` — the current latest minor series).
 */
export function getCurrentVersion(
  pathname: string,
  section: VersionedSection,
): string {
  const tail = pathname
    .slice(section.basePath.length)
    .replace(/^\/+|\/+$/g, '');
  if (!tail) return section.latestSeries;
  return tail.split('/')[0];
}

/**
 * Props consumed by the client-side `<VersionSelector>` popover. All values
 * are precomputed at build time from the page slug so the client component
 * can stay a pure presentation layer (no `usePathname()`, no version-list
 * lookups in the browser).
 */
export interface VersionSelectorProps {
  versions: VersionEntry[];
  currentVersion: string;
  currentLabel: string;
  /**
   * Map of version `value` → absolute URL the user should land on when
   * picking that version. Keyed by `version.value` to avoid recomputing
   * `computeSectionVersionUrl` in the browser.
   */
  versionUrls: Record<string, string>;
}

/**
 * Compute the props for `<VersionSelector>` from a static page slug. Returns
 * `null` when the slug is not inside a versioned section so the page can
 * skip rendering (and importing) the component entirely.
 */
export function getVersionSelectorProps(
  slug: readonly string[],
): VersionSelectorProps | null {
  const pathname = `/${slug.join('/')}`;
  const section = getVersionedSection(pathname);
  if (!section) return null;

  const currentVersion = getCurrentVersion(pathname, section);
  const currentLabel =
    section.versions.find((v) => v.value === currentVersion)?.label ??
    currentVersion;

  const versionUrls: Record<string, string> = {};
  for (const version of section.versions) {
    versionUrls[version.value] = computeSectionVersionUrl(
      section.basePath,
      version.value,
      section.latestSeries,
    );
  }

  return {
    versions: section.versions,
    currentVersion,
    currentLabel,
    versionUrls,
  };
}
