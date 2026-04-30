const fs = require('fs');
const path = require('path');

// Load .env from this directory or the parent deployment directory
const dotenvPath = fs.existsSync(path.join(__dirname, '.env'))
  ? path.join(__dirname, '.env')
  : path.join(__dirname, '..', '.env');
require('dotenv').config({ path: dotenvPath });

const mode = process.env.MODE || 'dev';
const domain = process.env.DOMAIN || 'localhost';
const scheme = process.env.SCHEME || 'http';
const wsScheme = scheme === 'https' ? 'wss' : 'ws';

const basePath     = path.join(__dirname, 'src/config/config.base.json');
const overridePath = path.join(__dirname, `src/config/config.${mode}.json`);
const outputPath   = path.join(__dirname, 'src/config/config.json');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, cloneValue(v)])
    );
  }
  return value;
}

// Recursively merge objects:
// - plain objects are merged by key
// - arrays in override fully replace base arrays
// - primitives (including null) replace base values
function mergeConfig(baseValue, overrideValue) {
  if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
    return cloneValue(overrideValue);
  }

  const merged = cloneValue(baseValue);
  for (const [key, value] of Object.entries(overrideValue)) {
    if (key in merged) {
      merged[key] = mergeConfig(merged[key], value);
    } else {
      merged[key] = cloneValue(value);
    }
  }
  return merged;
}

// Keys set to null in an override act as "delete this key from the base"
function stripNulls(obj) {
  if (Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, v && typeof v === 'object' ? stripNulls(v) : v])
  );
}

try {
  const base     = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const override = fs.existsSync(overridePath)
    ? JSON.parse(fs.readFileSync(overridePath, 'utf8'))
    : {};

  const merged = stripNulls(mergeConfig(base, override));
  const output = JSON.stringify(merged, null, '\t')
    .replace(/__DOMAIN__/g, domain)
    .replace(/__SCHEME__/g, scheme)
    .replace(/__WS_SCHEME__/g, wsScheme);

  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`Config for mode '${mode}' with domain '${domain}' (${scheme}) written to config.json`);
} catch (err) {
  console.error('Error preparing config:', err.message);
  process.exit(1);
}
