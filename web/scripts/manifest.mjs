import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { keccak256, toBytes } from 'viem';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, 'dist');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
  return value;
}
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const handoff = await json(resolve(root, 'web/config/deployment.json'));
const network = await json(resolve(root, 'web/config/network.json'));
const pinned = resolve(root, '.imd/reads/deployment.json');
try { assert(canonical(await json(pinned)) === canonical(handoff), 'Build handoff differs from pinned deployment'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
try { assert(canonical(await json(resolve(root, '.imd/reads/network.json'))) === canonical(network), 'Network differs from pinned network'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const contracts = [];
for (const contract of handoff.contracts) {
  const abiPath = `abi/${contract.name}.json`;
  const raw = await readFile(resolve(dist, abiPath));
  const abi = JSON.parse(raw);
  assert(Array.isArray(abi), `${abiPath} must be a raw ABI array`);
  const hash = keccak256(toBytes(canonical(abi))).slice(2);
  assert(hash === contract.abiHash, `${contract.name}: canonical ABI hash mismatch: ${hash}`);
  const original = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/${abiPath}`], { cwd: root });
  assert(Buffer.compare(raw, original) === 0, `${contract.name}: ABI bytes differ from pinned source export`);
  contracts.push({ name: contract.name, address: contract.address, abiHash: contract.abiHash, abiPath });
}

async function enumerate(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    assert(!entry.isSymbolicLink(), 'Export cannot contain symlinks');
    if (entry.isDirectory()) files.push(...await enumerate(path));
    else files.push(path);
  }
  return files;
}
const files = (await enumerate(dist)).filter(file => relative(dist, file) !== 'imd-deployment.json').sort();
assert(files.length <= 128, 'Export exceeds 128 assets');
let bytes = 0;
const assets = [];
for (const file of files) {
  const size = (await stat(file)).size;
  assert(size <= 8388608, `File exceeds 8 MiB: ${file}`);
  bytes += size;
  assets.push({ path: relative(dist, file).replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
}
assert(bytes < 30 * 1024 * 1024, 'Export leaves insufficient response-body budget');
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  network: network.network,
  ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}),
};
if (process.argv.includes('--check')) {
  const actual = await json(resolve(dist, 'imd-deployment.json'));
  assert(canonical(actual) === canonical(manifest), 'Manifest, handoff, ABI or asset inventory differs');
} else await writeFile(resolve(dist, 'imd-deployment.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Manifest ${process.argv.includes('--check') ? 'verified' : 'generated'}: ${assets.length} assets, ${bytes} bytes; pinned ABI hash verified.`);
