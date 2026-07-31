'use strict'

// Collapses the permutation sweeps to a single cell on phones too slow to
// finish them inside the harness and Device Farm ceilings. Both Android
// flagships share one build and one test package, so the scope can only be
// decided at runtime, from the device name. QVAC_TTS_REDUCED_MATRIX=1 forces
// the same path off Device Farm.

const proc = require('bare-process')

const REDUCED_MATRIX_ENV = 'QVAC_TTS_REDUCED_MATRIX'
const REDUCED_MATRIX_ENABLED = '1'

// Written by the mobile workflow's pre_test phase from $DEVICEFARM_DEVICE_NAME
// and loaded into the env by test/mobile/integration-runtime.cjs.
const DEVICE_NAME_ENV = 'QVAC_DEVICE_NAME'

// Matched case-insensitively as a substring, so every Pixel 9 variant Device
// Farm may hand out (Pixel 9, Pixel 9 Pro, Pixel 9 Pro XL) is covered.
const REDUCED_DEVICE_NAMES = ['pixel 9']

function matchesReducedDevice(deviceName) {
  if (!deviceName) return false
  const normalized = String(deviceName).toLowerCase()
  return REDUCED_DEVICE_NAMES.some((candidate) => normalized.includes(candidate))
}

function readsReducedMatrix(env) {
  if (!env) return false
  if (env[REDUCED_MATRIX_ENV] === REDUCED_MATRIX_ENABLED) return true
  return matchesReducedDevice(env[DEVICE_NAME_ENV])
}

function isReducedMatrix() {
  return readsReducedMatrix(proc.env)
}

function firstEntryOnly(items) {
  return items.slice(0, 1)
}

function reduceSweep(items, reduced = isReducedMatrix()) {
  return reduced ? firstEntryOnly(items) : items
}

module.exports = {
  REDUCED_MATRIX_ENV,
  REDUCED_MATRIX_ENABLED,
  DEVICE_NAME_ENV,
  REDUCED_DEVICE_NAMES,
  matchesReducedDevice,
  readsReducedMatrix,
  isReducedMatrix,
  firstEntryOnly,
  reduceSweep
}
