const fs = require('fs');
const path = require('path');
const deepmerge = require('deepmerge');

const mode = process.env.MODE || 'dev';
const domain = process.env.DOMAIN || 'localhost';

const basePath     = path.join(__dirname, 'src/config/config.base.json');
const overridePath = path.join(__dirname, `src/config/config.${mode}.json`);
const outputPath   = path.join(__dirname, 'src/config/config.json');

// Arrays in overrides fully replace the base array rather than being concatenated
const arrayMerge = (_, sourceArray) => sourceArray;

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

  const merged = stripNulls(deepmerge(base, override, { arrayMerge }));
  const output = JSON.stringify(merged, null, '\t').replace(/__DOMAIN__/g, domain);

  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`Config for mode '${mode}' with domain '${domain}' written to config.json`);
} catch (err) {
  console.error('Error preparing config:', err.message);
  process.exit(1);
}
