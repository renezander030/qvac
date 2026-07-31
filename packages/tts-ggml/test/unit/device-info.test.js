'use strict'

// Unit tests for the device-info loader that the reduced-matrix mechanism sits
// on. If this parser drops the line the mobile workflow writes, the throttled
// phone silently runs the full sweep again, so every rejection branch is
// pinned here rather than inferred from a green Device Farm run.

const fs = require('bare-fs')
const os = require('bare-os')
const path = require('bare-path')
const proc = require('bare-process')
const test = require('brittle')

const {
  DEVICE_INFO_FILE,
  DEVICE_INFO_PLATFORM,
  UNKNOWN_DEVICE,
  parseEnvLine,
  parseEnvLines,
  readDeviceInfo,
  injectEnv,
  loadDeviceInfo,
  shouldLoadDeviceInfo,
  deviceScopeLine,
  reportDeviceScope
} = require('../utils/deviceInfo')
const { DEVICE_NAME_ENV, REDUCED_MATRIX_ENV } = require('../utils/reducedMatrix')

function withTempFile(contents, fn) {
  const dir = path.join(os.tmpdir(), 'tts-ggml-device-info-' + Date.now() + '-' + Math.random())
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'qvacDeviceInfo.txt')
  try {
    if (contents !== null) fs.writeFileSync(file, contents)
    return fn(file, dir)
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (_e) {}
  }
}

// Restores the real env afterwards so these tests cannot leak a device name
// into the rest of the suite. Goes through bare-os because proc.env is a proxy
// that rejects delete.
function withRestoredEnv(keys, fn) {
  const saved = keys.map((key) => ({
    key,
    had: os.hasEnv(key),
    value: os.getEnv(key)
  }))
  try {
    return fn()
  } finally {
    for (const { key, had, value } of saved) {
      if (had) os.setEnv(key, value)
      else os.unsetEnv(key)
    }
  }
}

test('the device info path matches what the workflow writes', (t) => {
  t.is(DEVICE_INFO_FILE, '/data/local/tmp/qvacDeviceInfo.txt')
})

test('parseEnvLine keeps a plain assignment', (t) => {
  t.alike(parseEnvLine('QVAC_DEVICE_NAME=Google Pixel 9'), {
    key: 'QVAC_DEVICE_NAME',
    value: 'Google Pixel 9'
  })
})

test('parseEnvLine trims surrounding whitespace on both sides', (t) => {
  t.alike(parseEnvLine('  QVAC_DEVICE_NAME  =  Google Pixel 9  '), {
    key: 'QVAC_DEVICE_NAME',
    value: 'Google Pixel 9'
  })
})

test('parseEnvLine splits on the first separator only', (t) => {
  t.alike(parseEnvLine('KEY=a=b=c'), { key: 'KEY', value: 'a=b=c' })
})

test('parseEnvLine rejects comments, blanks and malformed lines', (t) => {
  t.is(parseEnvLine('# QVAC_DEVICE_NAME=Google Pixel 9'), null, 'comment')
  t.is(parseEnvLine(''), null, 'empty')
  t.is(parseEnvLine('   '), null, 'whitespace only')
  t.is(parseEnvLine('QVAC_DEVICE_NAME'), null, 'no separator')
  t.is(parseEnvLine('=Google Pixel 9'), null, 'empty key')
  t.is(parseEnvLine('QVAC_DEVICE_NAME='), null, 'empty value')
  t.is(parseEnvLine('QVAC_DEVICE_NAME=   '), null, 'whitespace-only value')
})

test('parseEnvLines keeps only the valid lines and preserves order', (t) => {
  const text = [
    '# a comment',
    '',
    'FIRST=1',
    'no-separator',
    '=orphan',
    'SECOND=two words',
    'THIRD='
  ]
  t.alike(parseEnvLines(text.join('\n')), [
    { key: 'FIRST', value: '1' },
    { key: 'SECOND', value: 'two words' }
  ])
})

test('parseEnvLines handles CRLF line endings', (t) => {
  t.alike(parseEnvLines('QVAC_DEVICE_NAME=Google Pixel 9\r\n'), [
    { key: 'QVAC_DEVICE_NAME', value: 'Google Pixel 9' }
  ])
})

test('readDeviceInfo reads the file the workflow writes', (t) => {
  withTempFile('QVAC_DEVICE_NAME=Google Pixel 9\n', (file) => {
    t.alike(readDeviceInfo(file), [{ key: 'QVAC_DEVICE_NAME', value: 'Google Pixel 9' }])
  })
})

test('readDeviceInfo returns nothing for a missing file', (t) => {
  withTempFile(null, (file) => {
    t.alike(readDeviceInfo(file), [], 'iOS and desktop runs have no such file')
  })
})

test('readDeviceInfo returns nothing for an empty file', (t) => {
  withTempFile('', (file) => {
    t.alike(readDeviceInfo(file), [])
  })
})

test('readDeviceInfo swallows a read failure instead of aborting the run', (t) => {
  withTempFile('QVAC_DEVICE_NAME=Google Pixel 9\n', (file, dir) => {
    // A directory exists but cannot be read as a file: the loader must degrade
    // to the full sweep rather than take the whole Device Farm run down.
    t.alike(readDeviceInfo(dir), [])
  })
})

test('injectEnv puts the values where both the tests and native code read them', (t) => {
  withRestoredEnv([DEVICE_NAME_ENV], () => {
    const injected = injectEnv([{ key: DEVICE_NAME_ENV, value: 'Google Pixel 9' }])
    t.is(injected, 1, 'returns how many values it set')
    t.is(proc.env[DEVICE_NAME_ENV], 'Google Pixel 9', 'visible via bare-process')
    t.is(os.getEnv(DEVICE_NAME_ENV), 'Google Pixel 9', 'visible via bare-os')
  })
})

test('loadDeviceInfo reads the file and injects it in one step', (t) => {
  withRestoredEnv([DEVICE_NAME_ENV], () => {
    withTempFile(`${DEVICE_NAME_ENV}=Google Pixel 9\n`, (file) => {
      t.is(loadDeviceInfo(file), 1, 'reports one value loaded')
      t.is(proc.env[DEVICE_NAME_ENV], 'Google Pixel 9')
      t.is(os.getEnv(DEVICE_NAME_ENV), 'Google Pixel 9')
    })
  })
})

test('loadDeviceInfo leaves the env untouched when the file is missing', (t) => {
  withRestoredEnv([DEVICE_NAME_ENV], () => {
    os.unsetEnv(DEVICE_NAME_ENV)
    withTempFile(null, (file) => {
      t.is(loadDeviceInfo(file), 0, 'nothing loaded')
      t.is(os.hasEnv(DEVICE_NAME_ENV), false, 'no device name invented')
    })
  })
})

test('the loader only runs on the platform that writes the file', (t) => {
  t.is(shouldLoadDeviceInfo(DEVICE_INFO_PLATFORM), true)
  t.is(shouldLoadDeviceInfo('ios'), false, 'iOS has no pre_test adb step')
  t.is(shouldLoadDeviceInfo('darwin'), false)
  t.is(shouldLoadDeviceInfo('linux'), false)
  t.is(shouldLoadDeviceInfo(undefined), false)
})

test('deviceScopeLine states the device and the scope it resolved to', (t) => {
  t.is(
    deviceScopeLine({ [DEVICE_NAME_ENV]: 'Google Pixel 9' }),
    '[device-info] device=Google Pixel 9 sweeps=reduced'
  )
  t.is(
    deviceScopeLine({ [DEVICE_NAME_ENV]: 'Samsung Galaxy S25 Ultra' }),
    '[device-info] device=Samsung Galaxy S25 Ultra sweeps=full'
  )
  t.is(
    deviceScopeLine({}),
    `[device-info] device=${UNKNOWN_DEVICE} sweeps=full`,
    'a missing device name must not silently imply reduced'
  )
  t.is(
    deviceScopeLine({ [REDUCED_MATRIX_ENV]: '1' }),
    `[device-info] device=${UNKNOWN_DEVICE} sweeps=reduced`,
    'the explicit override is reflected too'
  )
})

test('reportDeviceScope does nothing off Android', (t) => {
  const logged = []
  t.is(
    reportDeviceScope('ios', DEVICE_INFO_FILE, (line) => logged.push(line)),
    0
  )
  t.alike(logged, [], 'no scope is reported when nothing was loaded')
})

test('reportDeviceScope loads the file and reports the resolved scope', (t) => {
  withRestoredEnv([DEVICE_NAME_ENV], () => {
    withTempFile(`${DEVICE_NAME_ENV}=Google Pixel 9\n`, (file) => {
      const logged = []
      const injected = reportDeviceScope(DEVICE_INFO_PLATFORM, file, (line) => logged.push(line))
      t.is(injected, 1)
      t.alike(logged, ['[device-info] device=Google Pixel 9 sweeps=reduced'])
    })
  })
})

test('reportDeviceScope reports full scope when the file is missing', (t) => {
  withRestoredEnv([DEVICE_NAME_ENV], () => {
    os.unsetEnv(DEVICE_NAME_ENV)
    withTempFile(null, (file) => {
      const logged = []
      t.is(
        reportDeviceScope(DEVICE_INFO_PLATFORM, file, (line) => logged.push(line)),
        0
      )
      t.alike(logged, [`[device-info] device=${UNKNOWN_DEVICE} sweeps=full`])
    })
  })
})

test('withRestoredEnv restores the surrounding env', (t) => {
  const had = os.hasEnv(DEVICE_NAME_ENV)
  const before = os.getEnv(DEVICE_NAME_ENV)
  withRestoredEnv([DEVICE_NAME_ENV], () => {
    injectEnv([{ key: DEVICE_NAME_ENV, value: 'Google Pixel 9' }])
  })
  t.is(os.hasEnv(DEVICE_NAME_ENV), had)
  t.is(os.getEnv(DEVICE_NAME_ENV), before)
})
