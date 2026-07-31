'use strict'

// Chatterbox KV-cache × engine × GPU regression suite.
//
// This is the test that would have caught the multilingual Metal abort:
// `@qvac/tts-ggml` 0.3.2–0.3.5 defaulted the T3 KV cache to `q8_0`, which
// hard-aborts the **multilingual** Chatterbox model on a **Metal** GPU
// (`GGML_ABORT("unsupported op 'CONT'")` inside `eval_step_mtl`), while the
// EN Turbo model and the CPU backend were fine.  No existing test covered
// the MTL × GPU × q8_0 cell:
//   - gpu-smoke.test.js  -> GPU for both Turbo (en) and MTL, but only at the
//     addon-default (f16) KV dtype; the non-default cells are unique to here.
//   - chatterbox-mtl.test.js -> MTL, but CPU only.
//
// The sweep below loads each Chatterbox variant on the GPU across the
// GPU-safe KV dtypes (plus the package default) and asserts synthesis runs
// to completion and the GPU actually engaged.  A regressed default (or any
// dtype the active GPU backend can't run the MTL graph with) SIGABRTs the
// Bare process, failing the CI step.
//
// Coverage notes (see also: integration-test-tts-ggml.yml matrix):
//   - Real **Metal** coverage comes from the iOS Device Farm leg
//     (integration-mobile-test-tts-ggml.yml), which auto-includes this file
//     via test/mobile/integration.auto.cjs.  The desktop macOS-arm64 runner
//     is `no_gpu:true` (hosted paravirtual Metal is broken), so it skips.
//   - Linux/Windows GPU runners exercise Vulkan; there tts-cpp already forces
//     quantized KV -> f32, so the q8_0 cell can't reproduce the Metal bug,
//     but the f16/f32/default cells still guard those backends.
//   - NO_GPU=true (the no-GPU matrix entries) skips the whole file.

const fs = require('bare-fs')
const path = require('bare-path')
const test = require('brittle')

const {
  CHATTERBOX_VARIANTS,
  GPU_SAFE_KV_TYPES,
  NO_GPU,
  PROBE_UNSAFE,
  getBaseDir,
  kvLabel,
  resolveRefWavPath,
  ensureModelsFor,
  loadChatterbox,
  assertSynthesisCompletes
} = require('../utils/kvCacheMatrix')
const { isReducedMatrix } = require('../utils/reducedMatrix')

const LANGUAGE_FOR = { mtl: 'es', turbo: 'en' }

// A reduced run keeps one TURBO cell so the variant is still proven to load and
// synthesize on that GPU without repeating the dtype sweep. f32 rather than the
// default: gpu-smoke.test.js already runs both Turbo and MTL on the GPU at the
// default (f16) dtype on the same Android group, so a default cell here would
// cost a model load and buy nothing.
const REDUCED_GPU_CELL = { variant: 'turbo', kvCacheType: 'f32' }

// Load `variant` on the GPU with `kvCacheType`, synthesize once, assert it
// completed and engaged the GPU, then unload.  Shared by every matrix entry.
async function runGpuCase(t, variant, kvCacheType) {
  const baseDir = getBaseDir()
  const modelsDir = path.join(baseDir, 'models')

  const download = await ensureModelsFor(variant, modelsDir)
  if (!download.success) {
    t.fail(
      `Chatterbox ${variant} GGUFs not available - registry fetch failed. ` +
        'Run `npm run download-models:registry` or stage models locally.'
    )
    return
  }

  const refWavPath = resolveRefWavPath({})
  if (!fs.existsSync(refWavPath)) {
    t.pass('Skipped: reference audio missing')
    return
  }

  const tag = `Chatterbox ${variant.toUpperCase()}/GPU/kv=${kvLabel(kvCacheType)}`
  const model = await loadChatterbox({
    variant,
    modelDir: download.targetDir,
    refWavPath,
    language: LANGUAGE_FOR[variant],
    useGPU: true,
    kvCacheType
  })
  try {
    // Chatterbox now runs on the ARM Mali GPU, so the GPU is required here.
    await assertSynthesisCompletes(t, model, {
      tag,
      language: LANGUAGE_FOR[variant],
      minSamples: 2000,
      expectGpu: true,
      allowPolicyCpu: false
    })
  } finally {
    try {
      await model.unload()
    } catch (_e) {}
  }
}

// ── Headline regression: the exact cell that shipped broken ──────────────
// MTL + useGPU=true + DEFAULT KV cache. Pre-(q8_0 default) this
// aborts on Metal; post-fix (f16 default) it completes.
test(
  'Chatterbox MTL + useGPU=true + DEFAULT KV cache synthesizes to completion',
  { timeout: 600000, skip: NO_GPU || isReducedMatrix() },
  async (t) => {
    await runGpuCase(t, 'mtl', undefined)
  }
)

// ── Full GPU-safe sweep: every variant × {default, f16, f32} on GPU ──────
function kvCellsForVariant(variant) {
  const cells = []
  for (const kvCacheType of [undefined, ...GPU_SAFE_KV_TYPES]) {
    // The MTL/default cell is the headline test above; skip the duplicate.
    if (variant === 'mtl' && kvCacheType === undefined) continue
    cells.push({ variant, kvCacheType })
  }
  return cells
}

function fullGpuSweepCells() {
  const cells = []
  for (const variant of CHATTERBOX_VARIANTS) {
    cells.push(...kvCellsForVariant(variant))
  }
  return cells
}

function isReducedCell(cell) {
  return (
    cell.variant === REDUCED_GPU_CELL.variant && cell.kvCacheType === REDUCED_GPU_CELL.kvCacheType
  )
}

// Every cell stays registered on the reduced leg and the dropped ones report
// as skips, so its test-results.json still accounts for the full sweep instead
// of silently reporting a smaller total than the full leg.
function skipCell(cell) {
  return NO_GPU || (isReducedMatrix() && !isReducedCell(cell))
}

function registerGpuSweep(cells) {
  for (const cell of cells) {
    const { variant, kvCacheType } = cell
    test(
      `Chatterbox ${variant.toUpperCase()} + useGPU=true + kv=${kvLabel(kvCacheType)} synthesizes to completion`,
      { timeout: 600000, skip: skipCell(cell) },
      async (t) => {
        await runGpuCase(t, variant, kvCacheType)
      }
    )
  }
}

registerGpuSweep(fullGpuSweepCells())

// ── Opt-in: known-unsafe dtypes on the GPU (QVAC_TTS_KV_PROBE_UNSAFE=1) ──
// q8_0 still aborts the MTL model on Metal until the backend-aware tts-cpp
// fix lands (extend `chatterbox_resolve_kv_type` to probe CONT, not just
// flash-attn).  Off by default so CI stays green; turn it on to verify that
// follow-up once it ships (it should either complete or cleanly fall back to
// f32 — never SIGABRT).
for (const variant of CHATTERBOX_VARIANTS) {
  test(
    `Chatterbox ${variant.toUpperCase()} + useGPU=true + kv=q8_0 does not abort (opt-in: QVAC_TTS_KV_PROBE_UNSAFE)`,
    { timeout: 600000, skip: NO_GPU || !PROBE_UNSAFE },
    async (t) => {
      await runGpuCase(t, variant, 'q8_0')
    }
  )
}
