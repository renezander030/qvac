import type { Node } from 'fumadocs-core/page-tree';
import { resolveIcon } from '@/lib/resolveIcon';
import React from 'react';
import { SiExpo, SiElectron } from '@icons-pack/react-simple-icons';

/**
 * Only the API summary and release notes are versioned (one MDX per
 * version; latest at `index.mdx`, older at `vX.Y.Z.mdx` under
 * `content/docs/reference/api` and `content/docs/reference/release-notes`).
 * The version dropdown handles switching for those pages; everything else
 * uses a single bare path per topic.
 */

/**
 * Each top-level node of `customTree` is a collection, declared as a folder
 * with `root: true`. That flag is what makes Fumadocs treat it as a Layout
 * Tab and scope the sidebar to it: the framework matches the pathname
 * against the tree, takes the last root folder on that path as the active
 * root, and renders only that root's children.
 *
 * A collection's `index` is where its tab lands. It is not rendered as a
 * sidebar entry, so every collection also carries an explicit overview page
 * among its children — otherwise the overview would be reachable from the
 * tab but not from the sidebar.
 *
 * Every URL is collection-scoped, matching where the page now lives under
 * `content/docs/<collection>`. The framework resolves the active collection
 * by matching the pathname against the tree, so these prefixes are what makes
 * a page activate its own tab.
 */

const platformChildren: Node[] = [
  {
    name: 'Overview',
    url: '/platform',
    type: 'page',
    icon: resolveIcon('House'),
  },
  {
    type: 'separator',
    name: 'About QVAC',
  },
  {
    name: 'How it works',
    url: '/platform/about/how-it-works',
    type: 'page',
    icon: resolveIcon('Cog'),
  },
  {
    name: 'Vision',
    type: 'folder',
    icon: resolveIcon('Telescope'),
    index: { type: 'page', name: 'Vision', url: '/platform/about/vision' },
    children: [
      {
        name: 'Public launch',
        url: '/platform/about/public-launch',
        type: 'page',
        icon: resolveIcon('Megaphone'),
      },
    ],
  },
  {
    type: 'separator',
    name: 'Inventory',
  },
  {
    name: 'Addons',
    type: 'folder',
    icon: resolveIcon('Blocks'),
    index: { type: 'page', name: 'Addons', url: '/platform/addons' },
    children: [
      { name: 'llm-llamacpp', url: '/platform/addons/llm-llamacpp', type: 'page' },
      { name: 'embed-llamacpp', url: '/platform/addons/embed-llamacpp', type: 'page' },
      { name: 'translation-nmtcpp', url: '/platform/addons/translation-nmtcpp', type: 'page' },
      { name: 'transcription-whispercpp', url: '/platform/addons/transcription-whispercpp', type: 'page' },
      { name: 'transcription-parakeet', url: '/platform/addons/transcription-parakeet', type: 'page' },
      { name: 'tts-ggml', url: '/platform/addons/tts-ggml', type: 'page' },
      { name: 'ocr-onnx', url: '/platform/addons/ocr-onnx', type: 'page' },
      { name: 'diffusion-cpp', url: '/platform/addons/diffusion-cpp', type: 'page' },
    ],
  },
];

const sdkChildren: Node[] = [
  {
    type: 'separator',
    name: 'Getting started',
  },
  {
    name: 'Overview',
    url: '/sdk',
    type: 'page',
    icon: resolveIcon('DoorOpen'),
  },
  {
    name: 'Quickstart',
    url: '/sdk/quickstart',
    type: 'page',
    icon: resolveIcon('Rocket'),
  },
  {
    name: 'System requirements',
    url: '/sdk/system-requirements',
    type: 'page',
    icon: resolveIcon('Stethoscope'),
  },
  {
    name: 'Installation',
    url: '/sdk/installation',
    type: 'page',
    icon: resolveIcon('Package'),
  },
  {
    name: 'Configuration',
    type: 'folder',
    icon: resolveIcon('SlidersHorizontal'),
    index: { type: 'page', name: 'Configuration', url: '/sdk/configuration' },
    children: [
      {
        name: 'Plugin system',
        type: 'folder',
        icon: resolveIcon('Plug'),
        index: { type: 'page', name: 'Plugin system', url: '/sdk/configuration/plugins' },
        children: [
          {
            name: 'Write a custom plugin',
            url: '/sdk/configuration/plugins/write-custom-plugin',
            type: 'page',
          },
        ],
      },
    ],
  },
  {
    name: 'CLI',
    url: '/sdk/cli',
    type: 'page',
    icon: resolveIcon('Terminal'),
  },
  {
    type: 'separator',
    name: 'Models',
  },
  {
    name: 'Download lifecycle',
    url: '/sdk/models/download-lifecycle',
    type: 'page',
    icon: resolveIcon('Download'),
  },
  {
    name: 'Sharded models',
    url: '/sdk/models/sharded-models',
    type: 'page',
    icon: resolveIcon('Merge'),
  },
  {
    type: 'separator',
    name: 'AI capabilities',
  },
  {
    name: 'Text generation',
    url: '/sdk/ai-capabilities/text-generation',
    type: 'page',
    icon: resolveIcon('MessagesSquare'),
  },
  {
    name: 'Text embeddings',
    url: '/sdk/ai-capabilities/text-embeddings',
    type: 'page',
    icon: resolveIcon('Hash'),
  },
  {
    name: 'RAG',
    url: '/sdk/ai-capabilities/rag',
    type: 'page',
    icon: resolveIcon('ScanSearch'),
  },
  {
    name: 'Fine-tuning',
    url: '/sdk/ai-capabilities/fine-tuning',
    type: 'page',
    icon: resolveIcon('FlaskConical'),
  },
  {
    name: 'Multimodal',
    url: '/sdk/ai-capabilities/multimodal',
    type: 'page',
    icon: resolveIcon('GalleryHorizontal'),
  },
  {
    name: 'Batch processing',
    url: '/sdk/ai-capabilities/batch-processing',
    type: 'page',
    icon: resolveIcon('Boxes'),
  },
  {
    name: 'Image generation',
    url: '/sdk/ai-capabilities/image-generation',
    type: 'page',
    icon: resolveIcon('Image'),
  },
  {
    name: 'Video generation',
    url: '/sdk/ai-capabilities/video-generation',
    type: 'page',
    icon: resolveIcon('Video'),
  },
  {
    name: 'Transcription',
    url: '/sdk/ai-capabilities/transcription',
    type: 'page',
    icon: resolveIcon('Speech'),
  },
  {
    name: 'Text-to-Speech',
    url: '/sdk/ai-capabilities/text-to-speech',
    type: 'page',
    icon: resolveIcon('Volume2'),
  },
  {
    name: 'Voice assistant',
    url: '/sdk/ai-capabilities/voice-assistant',
    type: 'page',
    icon: resolveIcon('Mic'),
  },
  {
    name: 'Translation',
    url: '/sdk/ai-capabilities/translation',
    type: 'page',
    icon: resolveIcon('Languages'),
  },
  {
    name: 'BCI',
    url: '/sdk/ai-capabilities/bci',
    type: 'page',
    icon: resolveIcon('Brain'),
  },
  {
    name: 'VLA',
    url: '/sdk/ai-capabilities/vla',
    type: 'page',
    icon: resolveIcon('Eye'),
  },
  {
    name: 'OCR',
    url: '/sdk/ai-capabilities/ocr',
    type: 'page',
    icon: resolveIcon('ScanText'),
  },
  {
    name: 'Image classification',
    url: '/sdk/ai-capabilities/image-classification',
    type: 'page',
    icon: resolveIcon('Shapes'),
  },
  {
    type: 'separator',
    name: 'P2P capabilities',
  },
  {
    name: 'Delegated inference',
    url: '/sdk/p2p-capabilities/delegated-inference',
    type: 'page',
    icon: resolveIcon('Share2'),
  },
  {
    name: 'Blind relays',
    url: '/sdk/p2p-capabilities/blind-relays',
    type: 'page',
    icon: resolveIcon('Router'),
  },
  {
    type: 'separator',
    name: 'Runtime',
  },
  {
    name: 'Cancellation',
    url: '/sdk/runtime/cancellation',
    type: 'page',
    icon: resolveIcon('CircleStop'),
  },
  {
    name: 'Lifecycle',
    url: '/sdk/runtime/lifecycle',
    type: 'page',
    icon: resolveIcon('Moon'),
  },
  {
    name: 'Logging',
    url: '/sdk/runtime/logging',
    type: 'page',
    icon: resolveIcon('Activity'),
  },
  {
    name: 'Profiler',
    url: '/sdk/runtime/profiler',
    type: 'page',
    icon: resolveIcon('Timer'),
  },
  {
    type: 'separator',
    name: 'Tutorials',
  },
  {
    name: 'Build on Electron',
    url: '/sdk/tutorials/electron',
    type: 'page',
    icon: React.createElement(SiElectron, { className: 'h-4 w-4' }),
  },
  {
    name: 'Build on Expo',
    url: '/sdk/tutorials/expo',
    type: 'page',
    icon: React.createElement(SiExpo, { className: 'h-4 w-4' }),
  },
  {
    type: 'separator',
    name: 'Reference',
  },
  {
    name: 'API',
    url: '/sdk/reference/api',
    type: 'page',
    icon: resolveIcon('BookA'),
  },
  {
    name: 'Release notes',
    url: '/sdk/reference/release-notes',
    type: 'page',
    icon: resolveIcon('Tag'),
  },
  {
    type: 'separator',
    name: 'Help',
  },
  {
    name: 'Troubleshooting',
    url: '/sdk/troubleshooting',
    type: 'page',
    icon: resolveIcon('Bug'),
  },
  {
    name: 'Discord',
    url: 'https://discord.com/invite/tetherdev',
    type: 'page',
    external: true,
    icon: resolveIcon('MessageCircle'),
  },
];

const providerChildren: Node[] = [
  {
    name: 'HTTP server',
    url: '/provider/http-server',
    type: 'page',
    icon: resolveIcon('Server'),
  },
  {
    name: 'Connect tools',
    url: '/provider/http-server/connection',
    type: 'page',
  },
  {
    name: 'Integration',
    url: '/provider/http-server/integration',
    type: 'page',
  },
];

/**
 * Resources has no page yet: its index is the one new page this
 * reorganization authors for it, and it arrives with the content move. Until
 * then the folder holds nothing, which keeps it out of the collection bar —
 * a tab is only emitted for a root folder that has at least one URL.
 */
const resourcesChildren: Node[] = [];

export const customTree: Node[] = [
  {
    name: 'Platform',
    description: 'What QVAC is and what ships with it',
    type: 'folder',
    root: true,
    index: { type: 'page', name: 'Overview', url: '/platform' },
    children: platformChildren,
  },
  {
    name: 'SDK',
    description: 'Install, configure, and build with the SDK',
    type: 'folder',
    root: true,
    index: { type: 'page', name: 'Overview', url: '/sdk' },
    children: sdkChildren,
  },
  {
    name: 'Provider',
    description: 'Run and connect the model provider server',
    type: 'folder',
    root: true,
    index: { type: 'page', name: 'HTTP server', url: '/provider/http-server' },
    children: providerChildren,
  },
  {
    name: 'Resources',
    description: 'Tutorials, how-tos, and sample projects',
    type: 'folder',
    root: true,
    children: resourcesChildren,
  },
];
