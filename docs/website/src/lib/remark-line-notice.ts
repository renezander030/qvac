// Relative, not aliased: this module is part of `source.config.ts`'s import
// graph, which the MDX config loader resolves outside the Next path aliases.
import { versionOfFile } from './content-line'

/**
 * States the release a page documents, in the page's own text.
 *
 * The sidebar switcher says which line the reader is on, and the Markdown
 * twin says it in its front matter, but neither survives the operation that
 * matters most here: text pasted into a chat window, or a page scraped by
 * something that keeps only the prose. So the statement goes into the content
 * itself, where every representation of the page carries it.
 *
 * Injected at build time from the folder the file sits in, so no page states
 * its own version and moving a page between lines restates it correctly with
 * no edit.
 */

interface Node {
  type: string
  value?: string
  children?: Node[]
}

interface Root extends Node {
  children: Node[]
}

/**
 * One emphasis wrapping the whole sentence, rather than one per run of text
 * around the package name: a space next to an emphasis marker is not valid
 * emphasis, so the Markdown serializer escapes it, and the page's Markdown
 * twin would read `*Applies to&#x20;*`.
 */
export function noticeFor(pkg: string, version: string, current: boolean) {
  return {
    type: 'paragraph',
    children: [
      {
        type: 'emphasis',
        children: [
          { type: 'text', value: 'Applies to ' },
          { type: 'inlineCode', value: pkg },
          {
            type: 'text',
            value: current
              ? ` ${version}, the release this documentation currently describes.`
              : ` ${version}. This is not the current release.`,
          },
        ],
      },
    ],
  }
}

export default function remarkLineNotice() {
  return (tree: Root, file: { path?: string }) => {
    const line = file.path ? versionOfFile(file.path) : null
    if (!line) return

    tree.children.unshift(
      noticeFor(line.software.package, line.version.version, line.current),
    )
  }
}
