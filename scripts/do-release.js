#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { spawnSync, execFileSync } = require('child_process');
const { stdin, stdout } = require('process');

const VERSION_PATTERN = /^\d{4}-(0[1-9]|1[0-2])\.\d+$/;
const CONFIG_PATH = path.join(__dirname, '..', 'src', 'config', 'config.base.json');
const PACKAGE_PATH = path.join(__dirname, '..', 'package.json');

function runAndGetOutput(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    throw new Error(stderr || `${command} ${args.join(' ')} failed.`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}.`);
  }
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, '\t')}\n`, 'utf8');
}

function loadPackage() {
  return JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
}

function savePackage(pkg) {
  fs.writeFileSync(PACKAGE_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

function releaseVersionToPackageVersion(releaseVersion) {
  const match = releaseVersion.match(/^(\d{4})-(\d{2})\.(\d+)$/);

  if (!match) {
    throw new Error(`Cannot convert release version "${releaseVersion}" to package.json semver.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const releaseNumber = Number(match[3]);
  return `${year}.${month}.${releaseNumber}`;
}

function buildDefaultVersion(currentVersion) {
  const now = new Date();
  const currentPrefix = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const versionMatch = currentVersion.match(/^(\d{4}-\d{2})\.(\d+)$/);
  const nextNumber = versionMatch && versionMatch[1] === currentPrefix
    ? Number(versionMatch[2]) + 1
    : 0;

  return `${currentPrefix}.${nextNumber}`;
}

async function askReleaseVersion(rl, currentVersion) {
  const defaultVersion = buildDefaultVersion(currentVersion);

  while (true) {
    const answer = (await rl.question(
      `New release version (${VERSION_PATTERN.source}) [${defaultVersion}]: `
    )).trim();
    const releaseVersion = answer || defaultVersion;

    if (VERSION_PATTERN.test(releaseVersion)) {
      return releaseVersion;
    }

    console.log('Invalid format. Expected YYYY-MM.number, for example 2026-04.2');
  }
}

async function askReleaseMode(rl) {
  console.log('\nRelease mode');
  console.log('1. Commit all current local changes (including config/package version bumps), then release that commit');
  console.log('2. Create release from what is already committed on origin/master');

  while (true) {
    const answer = (await rl.question('Choose mode [1/2, default 1]: ')).trim();

    if (answer === '' || answer === '1') {
      return 1;
    }

    if (answer === '2') {
      return 2;
    }

    console.log('Please enter 1 or 2.');
  }
}

function getVersionFromGitRef(ref) {
  const configContent = runAndGetOutput('git', ['show', `${ref}:src/config/config.base.json`]);
  return JSON.parse(configContent).version;
}

function getPackageVersionFromGitRef(ref) {
  const packageContent = runAndGetOutput('git', ['show', `${ref}:package.json`]);
  return JSON.parse(packageContent).version;
}

async function finalizeLocalCommit(rl, releaseVersion) {
  const currentBranch = runAndGetOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

  if (currentBranch !== 'master') {
    throw new Error(`You are on "${currentBranch}". Switch to "master" before using mode 1.`);
  }

  const porcelainStatus = runAndGetOutput('git', ['status', '--porcelain']);

  if (porcelainStatus) {
    run('git', ['add', '-A']);
    const defaultMessage = `release: ${releaseVersion}`;
    const answer = (await rl.question(`Commit message [${defaultMessage}]: `)).trim();
    const commitMessage = answer || defaultMessage;
    run('git', ['commit', '-m', commitMessage]);
  } else {
    console.log('No local file changes to commit. Releasing current HEAD.');
  }

  run('git', ['push', 'origin', 'master']);
  return runAndGetOutput('git', ['rev-parse', 'HEAD']);
}

function prepareRemoteMasterRelease(releaseVersion, packageVersion) {
  run('git', ['fetch', 'origin', 'master']);
  const remoteVersion = getVersionFromGitRef('origin/master');
  const remotePackageVersion = getPackageVersionFromGitRef('origin/master');

  if (remoteVersion !== releaseVersion) {
    throw new Error(
      `origin/master has version "${remoteVersion}", but requested release version is "${releaseVersion}".`
    );
  }

  if (remotePackageVersion !== packageVersion) {
    throw new Error(
      `origin/master package.json version is "${remotePackageVersion}", but expected "${packageVersion}".`
    );
  }

  return runAndGetOutput('git', ['rev-parse', 'origin/master']);
}

async function confirm(rl, message) {
  const answer = (await rl.question(`${message} [y/N]: `)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

function ensureTagDoesNotExist(tagName) {
  const existingTag = runAndGetOutput('git', ['tag', '--list', tagName]);

  if (existingTag === tagName) {
    throw new Error(`Git tag "${tagName}" already exists.`);
  }
}

function ensureGhCliAvailable() {
  runAndGetOutput('gh', ['--version']);
}

function createGitHubRelease(tagName, targetSha) {
  run('gh', ['release', 'create', tagName, '--target', targetSha, '--title', tagName, '--generate-notes']);
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const config = loadConfig();
    const currentVersion = config.version;

    if (!VERSION_PATTERN.test(currentVersion)) {
      throw new Error(
        `Current config version "${currentVersion}" does not match YYYY-MM.number. Update it manually first.`
      );
    }

    console.log(`Current version: ${currentVersion}`);
    const releaseVersion = await askReleaseVersion(rl, currentVersion);
    const packageVersion = releaseVersionToPackageVersion(releaseVersion);
    config.version = releaseVersion;
    saveConfig(config);

    const pkg = loadPackage();
    pkg.version = packageVersion;
    savePackage(pkg);

    console.log(`Updated ${CONFIG_PATH} to version "${releaseVersion}".`);
    console.log(`Updated ${PACKAGE_PATH} to version "${packageVersion}".`);

    const mode = await askReleaseMode(rl);
    const targetSha = mode === 1
      ? await finalizeLocalCommit(rl, releaseVersion)
      : prepareRemoteMasterRelease(releaseVersion, packageVersion);

    ensureTagDoesNotExist(releaseVersion);
    ensureGhCliAvailable();

    const proceed = await confirm(
      rl,
      `Create GitHub release "${releaseVersion}" targeting commit ${targetSha.slice(0, 7)}?`
    );

    if (!proceed) {
      console.log('Release cancelled.');
      return;
    }

    createGitHubRelease(releaseVersion, targetSha);
    console.log(`GitHub release "${releaseVersion}" created.`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`Release failed: ${error.message}`);
  process.exit(1);
});
