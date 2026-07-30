'use strict'
// MTP speed benchmark: measures what draft-mtp speculative decoding actually
// buys, as a WITHIN-RUN ratio of spec-off vs spec-on decode time.
//
// Why a ratio and not absolute numbers: CI runners are shared and their
// absolute throughput drifts run-to-run by more than the effect being
// measured, so a number compared against a previous run's number is noise.
// Both configs are therefore loaded in ONE process and their timed runs are
// INTERLEAVED (off, on, off, on, ...), so thermal drift and neighbour load hit
// both arms roughly equally and the ratio stays meaningful even when the
// absolute figures do not. Same technique the VLM benchmark uses for Device
// Farm's shared device pool.
//
// Why decode WALL-CLOCK for identical output rather than stats.TPS: the two
// paths do not necessarily count `generatedTokens` the same way (it derives
// from the n_eval perf counter, and under speculation several tokens are
// emitted per decode), so a TPS ratio risks comparing different quantities.
// Because greedy MTP is output-identical to greedy plain decoding, timing the
// production of *the same answer* is apples-to-apples regardless of how the
// counters are defined. Both figures are reported so the discrepancy — if any
// — is visible in the data rather than assumed.
//
// This test REPORTS timing; it does not gate on it. The only assertions are
// the deterministic ones (identical output, speculation demonstrably on/off).
// A throughput threshold would be a flaky gate: two desktop CI legs run
// CPU-only, where speculative decoding is expected to gain little or nothing
// (its win comes from verifying N+1 tokens for roughly the cost of 1, which
// holds when decode is memory-bandwidth-bound, not compute-bound).
//
// Opt-in via QVAC_RUN_MTP_BENCH=true, and excluded from the mobile group
// coverage requirement in scripts/generate-mobile-integration-tests.js
// (isOverrideOnly), so neither the normal desktop integration suite nor the
// Device Farm groups pay for it.

const path = require('bare-path')
const proc = require('bare-process')
const LlmLlamacpp = require('../../index.js')
const { ensureModel, safeTest } = require('./utils')
const { recordPerformance, isDarwinX64, isLinuxArm64 } = require('./_perf-helper.js')

const useCpu = isDarwinX64 || isLinuxArm64
const benchOptIn = !!(proc.env && proc.env.QVAC_RUN_MTP_BENCH === 'true')

// Deliberately no `url`: the mobile manifest generator discovers staging
// models by scanning for `{ name, url }` pairs, and this benchmark is
// desktop/opt-in only. Desktop resolves the download from
// test/integration/models.manifest.json, where this model is already pinned
// by mtp.test.js.
const MODEL = { name: 'Qwen3.5-0.8B-MTP-Q8_0.gguf' }

// Long enough that decode dominates: MTP's benefit is per-decoded-token, so a
// short generation is mostly prefill and understates it. Reasoning is off so
// the measured span is plain decode.
const N_PREDICT = 256
const CTX_SIZE = 2048
// Timed pairs. Each pair is one spec-off + one spec-on run of the same prompt.
const PAIRS = 3

const PROMPT = [
  { role: 'system', content: 'You are a helpful assistant.' },
  {
    role: 'user',
    content:
      'Explain, in several complete sentences, how quantization reduces the memory footprint of a neural network and what trade-offs it introduces.'
  }
]

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

async function loadAddon(t, modelPath, withSpec) {
  const addon = new LlmLlamacpp({
    files: { model: [modelPath] },
    config: baseConfig(withSpec),
    logger: console,
    opts: { stats: true }
  })
  await addon.load()
  t.teardown(async () => {
    await addon.unload().catch(() => {})
  })
  return addon
}

// One timed generation. Returns the output plus wall-clock total and the
// decode span (total minus time-to-first-token), which is the part MTP acts on.
async function timedRun(addon) {
  const chunks = []
  const ticker = setInterval(() => {}, 50)
  // Date.now() to match the rest of the perf harness (_benchmark-perf.js,
  // _vlm-image-perf.js). Millisecond resolution is ample for runs measured in
  // seconds, and it avoids depending on a high-resolution clock API that the
  // Bare runtime may not expose.
  const startedAt = Date.now()
  try {
    const response = await addon.run(PROMPT)
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

safeTest(
  'MTP speed: within-run decode-time ratio vs non-speculative',
  { skip: !benchOptIn, timeout: 1_800_000 },
  async (t) => {
    const [modelName, dirPath] = await ensureModel({ modelName: MODEL.name })
    const modelPath = path.join(dirPath, modelName)

    // Both arms live in one process for the whole benchmark so the comparison
    // is against the same machine in the same thermal state.
    const plainAddon = await loadAddon(t, modelPath, false)
    const specAddon = await loadAddon(t, modelPath, true)

    // Warm up each arm once, untimed: the first generation on a fresh context
    // pays kernel/allocator warmup that would otherwise land entirely on
    // whichever arm happens to run first.
    await timedRun(plainAddon)
    await timedRun(specAddon)

    const plainRuns = []
    const specRuns = []
    let plainOutput = null
    let specOutput = null

    for (let pair = 1; pair <= PAIRS; pair++) {
      // Interleaved, not grouped — see the header note on drift.
      const plain = await timedRun(plainAddon)
      const spec = await timedRun(specAddon)
      plainRuns.push(plain)
      specRuns.push(spec)
      plainOutput = plain.output
      specOutput = spec.output
      console.log(
        `  pair ${pair}: non-spec decode=${plain.decodeMs.toFixed(0)}ms spec decode=${spec.decodeMs.toFixed(0)}ms ` +
          `(accepted ${spec.stats.draftAccepted}/${spec.stats.draftTotal})`
      )
    }

    const plainDecode = median(plainRuns.map((r) => r.decodeMs))
    const specDecode = median(specRuns.map((r) => r.decodeMs))
    const ratio = specDecode > 0 ? plainDecode / specDecode : 0
    const lastSpec = specRuns[specRuns.length - 1]
    const acceptRate =
      lastSpec.stats.draftTotal > 0 ? lastSpec.stats.draftAccepted / lastSpec.stats.draftTotal : 0

    console.log('  ---- MTP speed summary ----')
    console.log(`  median decode  non-spec : ${plainDecode.toFixed(0)}ms`)
    console.log(`  median decode  spec     : ${specDecode.toFixed(0)}ms`)
    console.log(`  decode speedup (x)      : ${ratio.toFixed(3)}  (>1 means MTP is faster)`)
    console.log(`  acceptance rate         : ${acceptRate.toFixed(2)}`)
    console.log(`  chars generated         : ${specOutput.length}`)
    // Reported alongside the wall-clock numbers so the two can be compared: if
    // these disagree with the decode-time ratio, stats.TPS/generatedTokens are
    // counting decodes rather than emitted tokens on the speculative path.
    console.log(
      `  stats TPS non-spec=${plainRuns[plainRuns.length - 1].stats.TPS} spec=${lastSpec.stats.TPS}`
    )
    console.log(
      `  stats generatedTokens non-spec=${plainRuns[plainRuns.length - 1].stats.generatedTokens} spec=${lastSpec.stats.generatedTokens}`
    )

    const deviceTag = useCpu ? '[cpu]' : '[gpu]'
    recordPerformance(`${deviceTag} mtp-speedup non-speculative`, plainRuns[0].totalMs, {
      stats: plainRuns[0].stats
    })
    recordPerformance(`${deviceTag} mtp-speedup draft-mtp`, specRuns[0].totalMs, {
      stats: specRuns[0].stats
    })

    // Assertions are deterministic only. The ratio above is DATA, not a gate —
    // asserting a speedup threshold on a shared CI runner (CPU-only on two
    // desktop legs) would be flaky by construction.
    t.ok(specOutput.length > 0, 'speculative arm produced output')
    t.is(specOutput, plainOutput, 'both arms produced identical output (greedy equivalence)')
    t.ok(
      lastSpec.stats.draftTotal > 0,
      `speculative arm really drafted (draftTotal=${lastSpec.stats.draftTotal})`
    )
    t.is(
      plainRuns[plainRuns.length - 1].stats.draftTotal,
      0,
      'non-speculative arm drafted nothing (draftTotal=0)'
    )
    t.ok(ratio > 0, `decode-time ratio computed (${ratio.toFixed(3)}x)`)
  }
)
