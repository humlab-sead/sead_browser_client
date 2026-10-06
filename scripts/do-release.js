#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { spawnSync, execFileSync } = require('child_process');
const { stdin, stdout } = require('process');

// The client is versioned with semver and tagged vX.Y.Z. The YYYY-MM.N form belongs to
// SEAD releases (sead-deployment), which is what the client shows as its release.
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const PACKAGE_PATH = path.join(__dirname, '..', 'package.json');
const PACKAGE_LOCK_PATH = path.join(__dirname, '..', 'package-lock.json');

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

function loadPackage() {
  return JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
}

function savePackage(pkg) {
  fs.writeFileSync(PACKAGE_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

// Keeps the lockfile's copy of the version in step with package.json
function savePackageLockVersion(version) {
  const lock = JSON.parse(fs.readFileSync(PACKAGE_LOCK_PATH, 'utf8'));
  lock.version = version;
  lock.packages[''].version = version;
  fs.writeFileSync(PACKAGE_LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

function tagForVersion(version) {
  return `v${version}`;
}

// The version in package.json while it has not been released, otherwise the next minor version
function buildDefaultVersion(currentVersion) {
  if (!tagExists(tagForVersion(currentVersion))) {
    return currentVersion;
  }

  const [major, minor] = currentVersion.split('.').map(Number);
  return `${major}.${minor + 1}.0`;
}

async function askReleaseVersion(rl, currentVersion) {
  const defaultVersion = buildDefaultVersion(currentVersion);

  while (true) {
    const answer = (await rl.question(
      `New release version (${VERSION_PATTERN.source}) [${defaultVersion}]: `
    )).trim();
    const releaseVersion = (answer || defaultVersion).replace(/^v/, '');

    if (VERSION_PATTERN.test(releaseVersion)) {
      return releaseVersion;
    }

    console.log('Invalid format. Expected MAJOR.MINOR.PATCH, for example 1.2.0');
  }
}

async function askReleaseMode(rl) {
  console.log('\nRelease mode');
  console.log('1. Commit all current local changes (including the package.json and package-lock.json version bump), then release that commit');
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
    const defaultMessage = `release: ${tagForVersion(releaseVersion)}`;
    const answer = (await rl.question(`Commit message [${defaultMessage}]: `)).trim();
    const commitMessage = answer || defaultMessage;
    run('git', ['commit', '-m', commitMessage]);
  } else {
    console.log('No local file changes to commit. Releasing current HEAD.');
  }

  run('git', ['push', 'origin', 'master']);
  return runAndGetOutput('git', ['rev-parse', 'HEAD']);
}

function prepareRemoteMasterRelease(releaseVersion) {
  run('git', ['fetch', 'origin', 'master']);
  const remotePackageVersion = getPackageVersionFromGitRef('origin/master');

  if (remotePackageVersion !== releaseVersion) {
    throw new Error(
      `origin/master package.json version is "${remotePackageVersion}", but requested release version is "${releaseVersion}".`
    );
  }

  return runAndGetOutput('git', ['rev-parse', 'origin/master']);
}

async function confirm(rl, message) {
  const answer = (await rl.question(`${message} [y/N]: `)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

function tagExists(tagName) {
  return runAndGetOutput('git', ['tag', '--list', tagName]) === tagName;
}

function ensureTagDoesNotExist(tagName) {
  if (tagExists(tagName)) {
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
    const pkg = loadPackage();
    const currentVersion = pkg.version;

    if (!VERSION_PATTERN.test(currentVersion)) {
      throw new Error(`package.json version "${currentVersion}" is not MAJOR.MINOR.PATCH. Update it manually first.`);
    }

    console.log(`Current version: ${currentVersion}`);
    const releaseVersion = await askReleaseVersion(rl, currentVersion);
    const tagName = tagForVersion(releaseVersion);
    pkg.version = releaseVersion;
    savePackage(pkg);
    savePackageLockVersion(releaseVersion);

    console.log(`Updated ${PACKAGE_PATH} and ${PACKAGE_LOCK_PATH} to version "${releaseVersion}".`);

    const mode = await askReleaseMode(rl);
    const targetSha = mode === 1
      ? await finalizeLocalCommit(rl, releaseVersion)
      : prepareRemoteMasterRelease(releaseVersion);

    ensureTagDoesNotExist(tagName);
    ensureGhCliAvailable();

    const proceed = await confirm(
      rl,
      `Create GitHub release "${tagName}" targeting commit ${targetSha.slice(0, 7)}?`
    );

    if (!proceed) {
      console.log('Release cancelled.');
      return;
    }

    createGitHubRelease(tagName, targetSha);
    console.log(`GitHub release "${tagName}" created.`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`Release failed: ${error.message}`);
  process.exit(1);
});
