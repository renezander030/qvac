'use strict'
// MTP speed benchmark: measures what draft-mtp speculative decoding actually
// buys, as a WITHIN-RUN ratio of spec-off vs spec-on decode time, across a
// MODEL SIZE x PROMPT CLASS matrix.
//
// Why a matrix. Two variables dominate whether speculation pays, and measuring
// one point tells you almost nothing:
//   - Acceptance rate is prompt-dependent. The same 0.8B model accepts ~0.83 of
//     its drafts on a short factual question and ~0.37 on open-ended prose.
//   - Speculation's benefit scales with model size. Its win comes from
//     verifying N+1 tokens for roughly the cost of 1, which holds when decode
//     is memory-bandwidth-bound. On a small model the fixed per-decode cost
//     (graph launch, thread sync) dominates instead, and fabric's drafter
//     issues one llama_decode per drafted token -- so a round costs ~4 launches
//     to produce ~2 tokens against ~2 launches for plain decoding. That
//     overhead amortises as the model grows.
//
// Why a ratio and not absolute numbers: CI runners are shared and their
// absolute throughput drifts run-to-run by more than the effect being
// measured. Both arms are therefore loaded together per cell and their timed
// runs INTERLEAVED (off, on, off, on), so drift and neighbour load hit both
// arms roughly equally. Verified: an isolated control (one addon at a time,
// alternating order) reproduced the co-loaded result, and the ordering effect
// was under 2%.
//
// Why decode WALL-CLOCK rather than stats.TPS: llama only books a decode as
// generation when the batch holds exactly one token, so before the addon
// corrected it, every verify batch landed in the PROMPT bucket -- TPS read 0
// for a full answer. Timing the work directly avoids depending on that
// bookkeeping, and the wall-clock cross-check below catches any recurrence.
//
// This test REPORTS timing; it does not gate on it. The only assertions are
// the deterministic ones (both arms produced output, speculation demonstrably
// on in one and off in the other). Greedy output-equivalence is pinned
// separately in mtp.test.js on a short prompt — deliberately NOT here, because
// a long open-ended prompt provokes backend-specific greedy tie-breaks.
//
// Opt-in via QVAC_RUN_MTP_BENCH=true, and excluded from the mobile group
// coverage requirement in scripts/generate-mobile-integration-tests.js
// (isOverrideOnly), so neither the normal desktop integration suite nor the
// Device Farm groups pay for it. The 2B/4B models are `warm: false` in
// models.manifest.json so CI never pre-downloads 6.7GB it will not use.

const path = require('bare-path')
const proc = require('bare-process')
const LlmLlamacpp = require('../../index.js')
const { ensureModel, safeTest } = require('./utils')
const { recordPerformance, isDarwinX64, isLinuxArm64 } = require('./_perf-helper.js')

const useCpu = isDarwinX64 || isLinuxArm64
const benchOptIn = !!(proc.env && proc.env.QVAC_RUN_MTP_BENCH === 'true')

// All Q8_0 so model SIZE is the only variable across rows. Mixing quants would
// confound it: lower-bit weights decode faster and push the workload toward
// compute-bound, which independently reduces speculative benefit.
//
// Deliberately no `url` fields: the mobile manifest generator discovers staging
// models by scanning for `{ name, url }` pairs, and this benchmark is
// desktop/opt-in only. Desktop resolves downloads from
// test/integration/models.manifest.json, where all three are SHA-pinned.
const MODELS = [
  { label: '0.8B', name: 'Qwen3.5-0.8B-MTP-Q8_0.gguf' },
  { label: '2B', name: 'Qwen3.5-2B-MTP-Q8_0.gguf' },
  { label: '4B', name: 'Qwen3.5-4B-MTP-Q8_0.gguf' }
]

// Three classes spanning the acceptance range, since acceptance is the
// dominant term in whether speculation pays.
const PROMPTS = [
  {
    label: 'short-factual',
    // Same prompt as mtp.test.js: a short, high-confidence answer where the
    // drafter is rarely wrong (~0.83 acceptance observed on 0.8B).
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the capital of France? Answer in one complete sentence.' }
    ]
  },
  {
    label: 'structured',
    // Highly predictable continuation: the token sequence is largely
    // determined by the format, which is the regime speculation is built for.
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content:
          'List the numbers from 1 to 40. Output exactly one line per number, formatted as "N. number N", with no commentary.'
      }
    ]
  },
  {
    label: 'open-ended',
    // Free-form prose: many plausible next tokens, so the drafter is wrong
    // often (~0.37 acceptance observed on 0.8B). MTP's unfavourable end.
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content:
          'Explain, in several complete sentences, how quantization reduces the memory footprint of a neural network and what trade-offs it introduces.'
      }
    ]
  }
]

// 128 rather than 256: the matrix is 3 models x 3 prompts x (2 warmup + 6
// timed) = 72 generations, and the 4B arm would otherwise dominate the
// runtime. 128 still keeps decode well clear of prefill.
const N_PREDICT = 128
const CTX_SIZE = 2048
// Timed pairs per cell. Each pair is one spec-off + one spec-on run.
const PAIRS = 3

function baseConfig(withSpec) {
  const config = {
    device: useCpu ? 'cpu' : 'gpu',
    gpu_layers: '999',
    ctx_size: String(CTX_SIZE),
    n_predict: String(N_PREDICT),
    temp: '0',
    seed: '42',
    'reasoning-budget': '0',
    verbosity: '0'
  }
  if (withSpec) config['spec-type'] = 'draft-mtp'
  return config
}

// Loaded and unloaded per cell rather than registered on the test: 4B Q8_0 is
// 4.6GB and holding three models' worth of contexts at once would be wasteful
// (and on a constrained box, self-defeating).
async function loadAddon(modelPath, withSpec) {
  const addon = new LlmLlamacpp({
    files: { model: [modelPath] },
    config: baseConfig(withSpec),
    logger: { info() {}, error() {}, warn() {}, debug() {} },
    opts: { stats: true }
  })
  await addon.load()
  return addon
}

// One timed generation. Returns the output plus wall-clock total and the
// decode span (total minus time-to-first-token), which is the part MTP acts on.
async function timedRun(addon, messages) {
  const chunks = []
  const ticker = setInterval(() => {}, 50)
  // Date.now() to match the rest of the perf harness (_benchmark-perf.js,
  // _vlm-image-perf.js). Millisecond resolution is ample for runs measured in
  // seconds, and it avoids depending on a high-resolution clock API that the
  // Bare runtime may not expose.
  const startedAt = Date.now()
  try {
    const response = await addon.run(messages)
    await response
      .onUpdate((data) => {
        chunks.push(data)
      })
      .await()
    const totalMs = Date.now() - startedAt
    const stats = response.stats
    const ttftMs = Number(stats.TTFT) || 0
    return {
      output: chunks.join('').trim(),
      totalMs,
      decodeMs: totalMs > ttftMs ? totalMs - ttftMs : totalMs,
      ttftMs,
      stats
    }
  } finally {
    clearInterval(ticker)
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Measure one (model, prompt) cell. Returns the row for the summary table.
async function measureCell(t, modelPath, model, prompt) {
  const plainAddon = await loadAddon(modelPath, false)
  const specAddon = await loadAddon(modelPath, true)
  try {
    // Warm up each arm once, untimed: the first generation on a fresh context
    // pays kernel/allocator warmup that would otherwise land entirely on
    // whichever arm happens to run first.
    await timedRun(plainAddon, prompt.messages)
    await timedRun(specAddon, prompt.messages)

    const plainRuns = []
    const specRuns = []
    for (let pair = 1; pair <= PAIRS; pair++) {
      // Interleaved, not grouped — see the header note on drift.
      plainRuns.push(await timedRun(plainAddon, prompt.messages))
      specRuns.push(await timedRun(specAddon, prompt.messages))
    }

    const plainDecode = median(plainRuns.map((r) => r.decodeMs))
    const specDecode = median(specRuns.map((r) => r.decodeMs))
    const plainWall = median(plainRuns.map((r) => r.totalMs))
    const specWall = median(specRuns.map((r) => r.totalMs))
    const lastSpec = specRuns[specRuns.length - 1]
    const lastPlain = plainRuns[plainRuns.length - 1]
    const acceptRate =
      lastSpec.stats.draftTotal > 0 ? lastSpec.stats.draftAccepted / lastSpec.stats.draftTotal : 0

    const row = {
      model: model.label,
      prompt: prompt.label,
      plainDecode,
      specDecode,
      // decodeMs subtracts TTFT, so it is only trustworthy while TTFT is. The
      // wall ratio depends on nothing the addon reports; if the two disagree,
      // believe wall-clock and suspect the stats.
      decodeRatio: specDecode > 0 ? plainDecode / specDecode : 0,
      wallRatio: specWall > 0 ? plainWall / specWall : 0,
      plainWall,
      specWall,
      acceptRate,
      draftAccepted: lastSpec.stats.draftAccepted,
      draftTotal: lastSpec.stats.draftTotal,
      plainTps: lastPlain.stats.TPS,
      specTps: lastSpec.stats.TPS,
      chars: lastSpec.output.length,
      backend: lastSpec.stats.backendDevice === 'gpu' ? 'gpu' : 'cpu'
    }

    console.log(
      `  [${model.label} / ${prompt.label}] decode ${plainDecode.toFixed(0)}ms -> ${specDecode.toFixed(0)}ms ` +
        `(${row.decodeRatio.toFixed(3)}x), wall ${row.wallRatio.toFixed(3)}x, ` +
        `accept ${lastSpec.stats.draftAccepted}/${lastSpec.stats.draftTotal} = ${acceptRate.toFixed(2)}, ` +
        `TPS ${Number(lastPlain.stats.TPS).toFixed(1)} -> ${Number(lastSpec.stats.TPS).toFixed(1)}`
    )

    // Tag from the backend the addon actually resolved, NOT the requested
    // device: a box with no usable GPU asks for "gpu", ggml reports "No
    // devices found" and silently runs on CPU.
    const tag = `[${row.backend}] mtp-speedup ${model.label}/${prompt.label}`
    recordPerformance(`${tag} non-speculative`, lastPlain.totalMs, { stats: lastPlain.stats })
    recordPerformance(`${tag} draft-mtp`, lastSpec.totalMs, { stats: lastSpec.stats })

    // Deterministic assertions only — the ratios are DATA, never a gate.
    t.ok(
      lastPlain.output.length > 0,
      `[${model.label}/${prompt.label}] non-spec arm produced output`
    )
    t.ok(lastSpec.output.length > 0, `[${model.label}/${prompt.label}] spec arm produced output`)
    t.ok(
      lastSpec.stats.draftTotal > 0,
      `[${model.label}/${prompt.label}] spec arm really drafted (draftTotal=${lastSpec.stats.draftTotal})`
    )
    t.is(
      lastPlain.stats.draftTotal,
      0,
      `[${model.label}/${prompt.label}] non-spec arm drafted nothing`
    )
    return row
  } finally {
    await plainAddon.unload().catch(() => {})
    await specAddon.unload().catch(() => {})
  }
}

safeTest(
  'MTP speed: decode-time ratio vs non-speculative across model sizes and prompt classes',
  { skip: !benchOptIn, timeout: 3_600_000 },
  async (t) => {
    const rows = []
    for (const model of MODELS) {
      const [modelName, dirPath] = await ensureModel({ modelName: model.name })
      const modelPath = path.join(dirPath, modelName)
      for (const prompt of PROMPTS) {
        rows.push(await measureCell(t, modelPath, model, prompt))
      }
    }

    console.log('')
    console.log('==== MTP speedup matrix (>1.000 means MTP is FASTER) ====')
    console.log('model  prompt          decode-x  wall-x  accept  plain-TPS  spec-TPS  backend')
    for (const r of rows) {
      console.log(
        `${r.model.padEnd(6)} ${r.prompt.padEnd(15)} ` +
          `${r.decodeRatio.toFixed(3).padStart(8)} ${r.wallRatio.toFixed(3).padStart(7)} ` +
          `${r.acceptRate.toFixed(2).padStart(7)} ${Number(r.plainTps).toFixed(1).padStart(10)} ` +
          `${Number(r.specTps).toFixed(1).padStart(9)}  ${r.backend}`
      )
    }
    const best = rows.reduce((a, b) => (b.wallRatio > a.wallRatio ? b : a))
    console.log(
      `best cell: ${best.model}/${best.prompt} at ${best.wallRatio.toFixed(3)}x ` +
        `(acceptance ${best.acceptRate.toFixed(2)}, backend ${best.backend})`
    )
    console.log(
      `cells where MTP was faster: ${rows.filter((r) => r.wallRatio > 1).length}/${rows.length}`
    )
  }
)
