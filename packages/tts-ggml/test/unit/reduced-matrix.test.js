'use strict'

// Unit tests for the reduced-matrix switch that trims the permutation sweeps
// on the throttled phone in the Android dual-flagship run.
//
// The device name only reaches the tests because the mobile workflow's
// pre_test phase writes $DEVICEFARM_DEVICE_NAME to a file and
// integration-runtime.cjs loads it into the env under DEVICE_NAME_ENV. Both
// ends of that chain are asserted here, so renaming either the variable or the
// file cannot silently restore the full sweep on the slow phone.

const fs = require('bare-fs')
const os = require('bare-os')
const path = require('bare-path')
const proc = require('bare-process')
const test = require('brittle')

const {
  REDUCED_MATRIX_ENV,
  REDUCED_MATRIX_ENABLED,
  DEVICE_NAME_ENV,
  matchesReducedDevice,
  readsReducedMatrix,
  isReducedMatrix,
  firstEntryOnly,
  reduceSweep
} = require('../utils/reducedMatrix')
const { DEVICE_INFO_FILE } = require('../utils/deviceInfo')

const SENTENCES = [{ lang: 'es' }, { lang: 'fr' }, { lang: 'de' }]
const MS_PER_MINUTE = 60 * 1000

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..')
const MOBILE_WORKFLOW = path.join(
  REPO_ROOT,
  '.github',
  'workflows',
  'integration-mobile-test-tts-ggml.yml'
)
const MOBILE_RUNTIME = path.join(__dirname, '..', 'mobile', 'integration-runtime.cjs')

// Goes through bare-os rather than assigning to proc.env, which is a proxy that
// rejects delete; reads still happen through proc.env, which proxies the same
// values back.
function withEnv(values, fn) {
  const keys = Object.keys(values)
  const saved = keys.map((key) => ({ key, had: os.hasEnv(key), value: os.getEnv(key) }))
  for (const key of keys) {
    if (values[key] === undefined) os.unsetEnv(key)
    else os.setEnv(key, values[key])
  }
  try {
    return fn()
  } finally {
    for (const { key, had, value } of saved) {
      if (had) os.setEnv(key, value)
      else os.unsetEnv(key)
    }
  }
}

test('every Pixel 9 variant Device Farm can hand out is matched', (t) => {
  t.is(matchesReducedDevice('Google Pixel 9'), true)
  t.is(matchesReducedDevice('Google Pixel 9 Pro'), true)
  t.is(matchesReducedDevice('Google Pixel 9 Pro XL'), true)
  t.is(matchesReducedDevice('google pixel 9'), true, 'match is case-insensitive')
})

test('the fast phone and unknown devices are not reduced', (t) => {
  t.is(matchesReducedDevice('Samsung Galaxy S25 Ultra'), false)
  t.is(matchesReducedDevice('Google Pixel 8 Pro'), false)
  t.is(matchesReducedDevice(''), false)
  t.is(matchesReducedDevice(undefined), false)
})

test('readsReducedMatrix reduces on a matching device name', (t) => {
  t.is(readsReducedMatrix({ [DEVICE_NAME_ENV]: 'Google Pixel 9' }), true)
  t.is(readsReducedMatrix({ [DEVICE_NAME_ENV]: 'Samsung Galaxy S25 Ultra' }), false)
  t.is(readsReducedMatrix({}), false)
  t.is(readsReducedMatrix(undefined), false)
})

test('the explicit override forces the reduced path off Device Farm', (t) => {
  t.is(readsReducedMatrix({ [REDUCED_MATRIX_ENV]: REDUCED_MATRIX_ENABLED }), true)
  t.is(readsReducedMatrix({ [REDUCED_MATRIX_ENV]: '0' }), false)
  t.is(readsReducedMatrix({ [REDUCED_MATRIX_ENV]: 'true' }), false)
})

test('isReducedMatrix follows the live process env', (t) => {
  withEnv({ [DEVICE_NAME_ENV]: 'Google Pixel 9', [REDUCED_MATRIX_ENV]: undefined }, () =>
    t.is(isReducedMatrix(), true)
  )
  withEnv({ [DEVICE_NAME_ENV]: 'Samsung Galaxy S25 Ultra', [REDUCED_MATRIX_ENV]: undefined }, () =>
    t.is(isReducedMatrix(), false)
  )
  withEnv({ [DEVICE_NAME_ENV]: undefined, [REDUCED_MATRIX_ENV]: undefined }, () =>
    t.is(isReducedMatrix(), false)
  )
})

test('withEnv restores the original values so tests stay order-independent', (t) => {
  const before = proc.env[DEVICE_NAME_ENV]
  withEnv({ [DEVICE_NAME_ENV]: 'Google Pixel 9' }, () => {})
  t.is(proc.env[DEVICE_NAME_ENV], before)
})

test('firstEntryOnly keeps one entry and does not mutate the input', (t) => {
  const input = SENTENCES.slice()
  t.alike(firstEntryOnly(input), [{ lang: 'es' }])
  t.is(input.length, 3)
})

test('reduceSweep collapses to the first cell when reduced', (t) => {
  t.alike(reduceSweep(SENTENCES, true), [{ lang: 'es' }])
})

test('reduceSweep keeps every cell when not reduced', (t) => {
  t.alike(reduceSweep(SENTENCES, false), SENTENCES)
})

test('reduceSweep on an empty sweep stays empty', (t) => {
  t.alike(reduceSweep([], true), [])
})

test('reduceSweep defaults to the live env when no flag is passed', (t) => {
  withEnv({ [DEVICE_NAME_ENV]: 'Google Pixel 9' }, () =>
    t.alike(reduceSweep(SENTENCES), [{ lang: 'es' }])
  )
  withEnv({ [DEVICE_NAME_ENV]: undefined, [REDUCED_MATRIX_ENV]: undefined }, () =>
    t.alike(reduceSweep(SENTENCES), SENTENCES)
  )
})

test('the mobile runtime delegates the scope decision to the tested helper', (t) => {
  // The behaviour lives in deviceInfo (see device-info.test.js); all that is
  // left to pin here is that the runtime still calls it, unconditionally, so
  // the platform check cannot be re-inverted at the call site.
  const runtime = fs.readFileSync(MOBILE_RUNTIME, 'utf8')
  t.ok(runtime.includes("require('../utils/deviceInfo')"), 'runtime uses the device-info module')
  t.ok(runtime.includes('reportDeviceScope(os.platform())'), 'runtime calls it with the platform')
})

test('the mobile workflow writes the device name the runtime reads', (t) => {
  // Only present in a repo checkout; the published package ships tests without
  // the workflow tree, so there is nothing to cross-check there.
  if (!fs.existsSync(MOBILE_WORKFLOW)) {
    t.pass('skipped: workflow not present outside the repo checkout')
    return
  }
  const workflow = fs.readFileSync(MOBILE_WORKFLOW, 'utf8')
  t.ok(
    workflow.includes(`${DEVICE_NAME_ENV}=$DEVICEFARM_DEVICE_NAME`),
    `workflow must write ${DEVICE_NAME_ENV} from the Device Farm device name`
  )
  t.ok(
    workflow.includes(DEVICE_INFO_FILE),
    `workflow must write ${DEVICE_INFO_FILE}, the path the loader reads`
  )
  t.ok(
    workflow.includes('DEVICEFARM_DEVICE_NAME is unset'),
    'workflow must warn when the device name is missing instead of failing silently'
  )
})

test('the mocha ceiling stays above the per-test timeout', (t) => {
  if (!fs.existsSync(MOBILE_WORKFLOW)) {
    t.pass('skipped: workflow not present outside the repo checkout')
    return
  }
  const workflow = fs.readFileSync(MOBILE_WORKFLOW, 'utf8')
  const perTestMatch = workflow.match(/android-per-test-timeout-minutes:\s*'(\d+)'/)
  const mochaMatch = workflow.match(/mocha-timeout-ms:\s*'(\d+)'/)
  // Reported as assertions rather than dereferenced blindly: a rename or a
  // requote should name the invariant that broke, not throw on null.
  t.ok(perTestMatch, 'android-per-test-timeout-minutes is present in the workflow')
  t.ok(mochaMatch, 'mocha-timeout-ms is present in the workflow')
  if (!perTestMatch || !mochaMatch) return
  const perTestMinutes = Number(perTestMatch[1])
  const mochaMs = Number(mochaMatch[1])
  t.ok(
    mochaMs > perTestMinutes * MS_PER_MINUTE,
    `mocha-timeout-ms (${mochaMs}) must exceed the per-test wait (${perTestMinutes} min), ` +
      'or Mocha aborts the test before the per-test waitUntil can report'
  )
})
