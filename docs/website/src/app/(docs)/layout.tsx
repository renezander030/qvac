import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { baseOptions } from '@/lib/layout.shared';
import type { LinkItemType } from 'fumadocs-ui/layouts/shared';
import { FaGithub, FaDiscord, FaXTwitter } from 'react-icons/fa6';
import { SiHuggingface } from '@icons-pack/react-simple-icons';
import { KeetIcon } from '@/components/keet-icon';
import KeetRoomModalMount from '@/components/keet-modal';
import { customTree } from '@/lib/custom-tree';
import type { Node } from 'fumadocs-core/page-tree';
import {
  AskAISearchToggleLarge,
  AskAISearchToggleSmall,
  AskAIShell,
  // AskAITextSelection,  // disabled while we sort out the legacy fallback
} from '@/components/ask-ai';

export default function Layout({ children }: LayoutProps<'/'>) {
  const linkItems: LinkItemType[] = [
    {
      type: 'icon',
      url: 'https://github.com/tetherto/qvac',
      icon: <FaGithub />,
      text: 'GitHub',
      external: true,
    },
    {
      type: 'icon',
      url: 'https://discord.com/invite/tetherdev',
      icon: <FaDiscord />,
      text: 'Discord',
      external: true,
    },
    {
      type: 'icon',
      url: '#keet-room',
      label: 'Keet',
      text: 'Keet',
      icon: <KeetIcon />,
    },
    {
      type: 'icon',
      url: 'https://huggingface.co/qvac',
      label: 'Hugging Face',
      text: 'Hugging Face',
      icon: <SiHuggingface />,
      external: true,
    },
    {
      type: 'icon',
      url: 'https://x.com/QVAC',
      label: 'X (Twitter)',
      text: 'X (Twitter)',
      icon: <FaXTwitter />,
      external: true,
    },
  ];

  const base = baseOptions();

  // SPIKE (openspec/changes/reorganize-docs-into-collections, task 1.2):
  // throwaway single root folder, only to verify that `tabMode="navbar"`
  // renders a second header row. Revert or replace with the real four
  // collections before landing.
  const spikeTree: Node[] = [
    {
      type: 'folder',
      name: 'Docs',
      description: 'Everything, for now',
      root: true,
      index: { type: 'page', name: 'Home', url: '/' },
      children: customTree,
    },
  ];

  return (
    <>
      <DocsLayout
        {...base}
        nav={{ ...base.nav, mode: 'top' }}
        tabMode="navbar"
        links={linkItems}
        tree={{ name: 'docs', $id: 'latest', children: spikeTree }}
        searchToggle={{
          components: {
            lg: <AskAISearchToggleLarge />,
            sm: <AskAISearchToggleSmall />,
          },
        }}
      >
        {children}
      </DocsLayout>
      {/*
       * Custom Mintlify-style assistant. The unified `AskAIShell`
       * mounts ONE persistent fixed container: a bottom-anchored
       * composer bar that morphs into the chat modal, driven by the
       * same `AskAIProvider` state every existing trigger feeds
       * (top-nav button, hotkey, deep link, Cmd/Ctrl+K search hijack).
       * It is `position: fixed`, so it sits as a sibling of
       * `<DocsLayout>` and doesn't interact with its grid template.
       *
       * The legacy Inkeep modal (`AskAILegacyShell` + `AskAIPill`) is
       * preserved under `@/components/ask-ai-legacy` as an unmounted
       * fallback should the custom shell need to be parked again.
       */}
      <AskAIShell />
      <KeetRoomModalMount />
      {/* AskAITextSelection disabled — re-enable by uncommenting the import above and rendering <AskAITextSelection /> here. */}
    </>
  );
}
