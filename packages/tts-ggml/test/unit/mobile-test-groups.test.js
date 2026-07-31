'use strict'

// Guards test/mobile/test-groups.json against silent coverage loss.
//
// The mobile CI action greps Device Farm runs by the function names listed
// there, and a name that matches nothing simply runs zero tests: the run still
// reports green, so a typo or a renamed runner drops that test without any
// signal.

const fs = require('bare-fs')
const path = require('bare-path')
const test = require('brittle')

const MOBILE_DIR = path.join(__dirname, '..', 'mobile')
const GROUPS_FILE = path.join(MOBILE_DIR, 'test-groups.json')
const RUNNERS_FILE = path.join(MOBILE_DIR, 'integration.auto.cjs')
const PLATFORM_KEYS = ['ios', 'android']

function readGroups() {
  return JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'))
}

// The regex is built per call: a shared /g instance carries lastIndex between
// callers, which would make these tests order-dependent.
function declaredRunners() {
  const declaration = /^async function (run\w+)\s*\(/gm
  const source = fs.readFileSync(RUNNERS_FILE, 'utf8')
  const names = []
  let match = declaration.exec(source)
  while (match !== null) {
    names.push(match[1])
    match = declaration.exec(source)
  }
  return names
}

function testsIn(groups, platformKey) {
  const platform = groups[platformKey]
  if (!platform) return []
  const names = []
  for (const group of Object.values(platform)) {
    names.push(...group)
  }
  return names
}

function missingFrom(allowed, names) {
  return names.filter((name) => !allowed.includes(name))
}

function duplicatesIn(names) {
  return names.filter((name, index) => names.indexOf(name) !== index)
}

test('every declared runner name is unique and non-empty', (t) => {
  const runners = declaredRunners()
  t.ok(runners.length > 0, 'integration.auto.cjs declares at least one runner')
  t.alike(duplicatesIn(runners), [], 'no duplicate runner declarations')
})

test('every listed test resolves to a runner in integration.auto.cjs', (t) => {
  const groups = readGroups()
  const runners = declaredRunners()
  for (const key of PLATFORM_KEYS) {
    const names = testsIn(groups, key)
    t.ok(names.length > 0, `${key} lists at least one test`)
    t.alike(missingFrom(runners, names), [], `${key} references only declared runners`)
    t.alike(duplicatesIn(names), [], `${key} lists no duplicates`)
  }
})

test('the benchmark runners never appear in a functional group', (t) => {
  const groups = readGroups()
  const benchmarks = JSON.parse(fs.readFileSync(path.join(MOBILE_DIR, 'perf-tests.json'), 'utf8'))
  for (const key of PLATFORM_KEYS) {
    const overlap = testsIn(groups, key).filter((name) => benchmarks.includes(name))
    t.alike(overlap, [], `${key} must not schedule benchmark runners`)
  }
})
