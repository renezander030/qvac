'use strict'

/**
 * Unit tests for the RTF matrix runner's Core ML lane handling: label/env
 * shaping and the sidecar staging contract of `coreml: true` entries.
 * Pure filesystem logic — no npm spawn, no models.
 *
 * Run locally:
 *   node --test packages/asr-ggml/scripts/__tests__/run-rtf-benchmark-matrix.test.js
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  SkipEntryError,
  prepareCoremlEntry,
  buildLabel,
  buildParakeetEnv
} = require('../run-rtf-benchmark-matrix')

// The staging contract is darwin-only by design (prepareCoremlEntry skips
// everywhere else), so the filesystem tests only run there — which is also
// the only platform whose CI row carries coreml entries.
const onDarwin = process.platform === 'darwin'

function makeModelsDir () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtf-coreml-'))
  fs.writeFileSync(path.join(dir, 'parakeet-tdt-0.6b-v3.f16.gguf'), 'fake-gguf')
  return dir
}

test('coreml entries get a -coreml label suffix', () => {
  const entry = { engine: 'parakeet', modelType: 'tdt', quant: 'f16', useGPU: true, coreml: true }
  assert.equal(buildLabel('parakeet', entry, 0), '1-tdt-f16-gpu-coreml')
  const plain = { engine: 'parakeet', modelType: 'tdt', quant: 'f16', useGPU: true }
  assert.equal(buildLabel('parakeet', plain, 0), '1-tdt-f16-gpu')
})

test('coreml entries default the backend hint to coreml', () => {
  const env = buildParakeetEnv({ modelType: 'tdt', quant: 'f16', useGPU: true, coreml: true }, 'label')
  assert.equal(env.QVAC_PARAKEET_BENCHMARK_BACKEND, 'coreml')
  // An explicit hint still wins.
  const hinted = buildParakeetEnv({ modelType: 'tdt', coreml: true, backendHint: 'metal' }, 'label')
  assert.equal(hinted.QVAC_PARAKEET_BENCHMARK_BACKEND, 'metal')
})

test('unsupported model types are a hard failure, not a skip', { skip: !onDarwin }, () => {
  assert.throws(
    () => prepareCoremlEntry({ modelType: 'sortformer', coreml: true }, makeModelsDir()),
    (err) => !(err instanceof SkipEntryError) && /not supported/.test(err.message)
  )
})

test('missing sidecar is a skip, not a failure', { skip: !onDarwin }, () => {
  const modelsDir = makeModelsDir()
  assert.throws(
    () => prepareCoremlEntry({ modelType: 'tdt', quant: 'f16', coreml: true }, modelsDir),
    SkipEntryError
  )
})

test('staged sidecar yields a GGUF link beside it plus the benchmark env', { skip: !onDarwin }, () => {
  const modelsDir = makeModelsDir()
  fs.mkdirSync(path.join(modelsDir, 'coreml', 'parakeet-tdt-0.6b-v3-encoder.mlmodelc'), { recursive: true })

  const env = prepareCoremlEntry({ modelType: 'tdt', quant: 'f16', coreml: true }, modelsDir)

  const ggufLink = path.join(modelsDir, 'coreml', 'parakeet-tdt-0.6b-v3.f16.gguf')
  assert.equal(env.QVAC_TEST_GGUF_TDT, ggufLink)
  assert.equal(env.QVAC_PARAKEET_BENCHMARK_COREML, 'true')
  // The link resolves to the staged GGUF bytes and sits next to the sidecar,
  // where the engine's presence-driven loader looks.
  assert.equal(fs.readFileSync(ggufLink, 'utf8'), 'fake-gguf')

  // Idempotent for the second entry sharing the sidecar (another quant run).
  const again = prepareCoremlEntry({ modelType: 'tdt', quant: 'f16', coreml: true }, modelsDir)
  assert.equal(again.QVAC_TEST_GGUF_TDT, ggufLink)
})

test('missing staged GGUF next to a present sidecar is a hard failure', { skip: !onDarwin }, () => {
  const modelsDir = makeModelsDir()
  fs.mkdirSync(path.join(modelsDir, 'coreml', 'parakeet-ctc-0.6b-encoder.mlmodelc'), { recursive: true })
  assert.throws(
    () => prepareCoremlEntry({ modelType: 'ctc', quant: 'f16', coreml: true }, modelsDir),
    (err) => !(err instanceof SkipEntryError) && /not staged under models\//.test(err.message)
  )
})
