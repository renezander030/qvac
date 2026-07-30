import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  /**
   * How many worker processes the build runs, for collecting page data and
   * for rendering the static pages.
   *
   * Left alone, Next takes one per core — sixteen on the deployment builder —
   * and every one of them holds a full copy of what a page render needs. What
   * makes that expensive here is the Open Graph route: it renders an image per
   * page through Satori and a WASM rasterizer, and a worker's footprint grows
   * as it does more of them. Measured on this site, the generation phase peaks
   * at about 11 GB with sixteen workers, 8 GB with four, and 6.6 GB with two —
   * against roughly 8.2 GB for compilation, which the builder already carries.
   * Two workers is therefore the point where the build's ceiling stops being
   * this phase, and stays put as more documentation lines are published, since
   * the phase costs memory per worker and time per page.
   *
   * Without this the builder was killed mid-phase, having reported no progress
   * past `Generating static pages (0/242)`.
   */
  experimental: {
    cpus: 2,
  },
};

export default withMDX(config);
