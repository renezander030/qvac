'use strict'

// Device Farm only exposes the phone model to the host running the test spec,
// so the mobile workflow's pre_test phase writes it to DEVICE_INFO_FILE and
// this module loads it into the env before any test module is imported. It is
// the only way a test can tell which of the two Android flagships it landed
// on, because both share one build and one test package.

const fs = require('bare-fs')
const os = require('bare-os')
const proc = require('bare-process')

const { DEVICE_NAME_ENV, readsReducedMatrix } = require('./reducedMatrix')

const DEVICE_INFO_FILE = '/data/local/tmp/qvacDeviceInfo.txt'
const DEVICE_INFO_PLATFORM = 'android'
const UNKNOWN_DEVICE = '(unknown)'

// Values may contain '=' and spaces ("Google Pixel 9"), so only the first
// separator splits and the remainder is kept verbatim.
function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const separator = trimmed.indexOf('=')
  if (separator <= 0) return null
  const key = trimmed.slice(0, separator).trim()
  const value = trimmed.slice(separator + 1).trim()
  if (!key || !value) return null
  return { key, value }
}

function parseEnvLines(text) {
  const entries = []
  for (const line of text.split(/\r?\n/)) {
    const entry = parseEnvLine(line)
    if (entry) entries.push(entry)
  }
  return entries
}

function readDeviceInfo(filePath) {
  try {
    if (!fs.existsSync(filePath)) return []
    return parseEnvLines(fs.readFileSync(filePath, 'utf-8'))
  } catch (e) {
    console.warn(`[device-info] could not read ${filePath}: ${e.message}`)
    return []
  }
}

// os.setEnv is the single writer: bare-process exposes env as a live proxy over
// it, so assigning through proc.env as well would only duplicate the write.
function injectEnv(entries) {
  for (const { key, value } of entries) {
    os.setEnv(key, value)
  }
  return entries.length
}

function loadDeviceInfo(filePath = DEVICE_INFO_FILE) {
  return injectEnv(readDeviceInfo(filePath))
}

// Only the Android pre_test phase writes the file; iOS and desktop runs have
// nothing to load and must not report a scope they never resolved.
function shouldLoadDeviceInfo(platform) {
  return platform === DEVICE_INFO_PLATFORM
}

function deviceScopeLine(env) {
  const device = (env && env[DEVICE_NAME_ENV]) || UNKNOWN_DEVICE
  const scope = readsReducedMatrix(env) ? 'reduced' : 'full'
  return `[device-info] device=${device} sweeps=${scope}`
}

// Single call site for the mobile runtime: loads the device name, then states
// which scope it resolved to so a Device Farm log answers that directly.
function reportDeviceScope(platform, filePath = DEVICE_INFO_FILE, log = console.log) {
  if (!shouldLoadDeviceInfo(platform)) return 0
  const injected = loadDeviceInfo(filePath)
  log(deviceScopeLine(proc.env))
  return injected
}

module.exports = {
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
}
