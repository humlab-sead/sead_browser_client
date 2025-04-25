const fs = require('fs');
const path = require('path');

const mode = process.env.MODE || 'dev';
const domain = process.env.DOMAIN || 'localhost';

const configTemplatePath = path.join(__dirname, `src/config/config-${mode}.json`);
const configPath = path.join(__dirname, 'src/config/config.json');

fs.readFile(configTemplatePath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading ${configTemplatePath}:`, err);
    process.exit(1);
  }

  const result = data.replace(/__DOMAIN__/g, domain);

  fs.writeFile(configPath, result, 'utf8', (err) => {
    if (err) {
      console.error(`Error writing ${configPath}:`, err);
      process.exit(1);
    }
    console.log(`Configuration for mode '${mode}' with domain '${domain}' has been written to ${configPath}`);
  });
});
