/** Offline capture/package of the FULL build emitted by the successful isolated
 * Control API gate. Never compiles, runs Docker, installs authority or claims a
 * connected result. The caller invokes capture only after tests AND restore.
 * A hash-pinned receipt is operator provenance, not an independent attestation. */
import { constants, lstatSync, readdirSync, openSync, closeSync, fstatSync, readSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, dirname, normalize, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const NODE_IMAGE = 'node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32';
const schema = 'portal.qualified-control-api-build.v1', app = 'apps/control-api/';
const dockerPath = 'deploy/images/control-api.Dockerfile', bootstrap = 'deploy/control-api/bootstrap-users.yaml';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const refuse = () => { throw new Error('QUALIFIED_CONTROL_API_IMAGE_REFUSED'); };
const canonical = value => Buffer.from(JSON.stringify(value));
const hex = (value, n = 64) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(value);
const testCommand = value => typeof value === 'string' && /^npm test(?: --(?: test\/[A-Za-z0-9._-]+\.spec\.ts)*)?$/.test(value);
const safePath = value => typeof value === 'string' && value.length < 4096 && !value.startsWith('/') &&
  value.split('/').every(part => part && part !== '.' && part !== '..' && /^[A-Za-z0-9._-]+$/.test(part));
const imageInput = path => path === dockerPath || path === bootstrap ||
  /^apps\/control-api\/(src\/|migrations\/|package(?:-lock)?\.json$|tsconfig(?:\.build)?\.json$)/.test(path);
function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: null, maxBuffer: 32 * 1048576 });
  if (result.status !== 0 || result.error) refuse();
  return result.stdout;
}
function privateEmpty(directory) {
  if (!isAbsolute(directory) || normalize(directory) !== directory || directory === '/') refuse();
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700 ||
    readdirSync(directory).length) refuse();
  let parent = dirname(directory);
  for (;;) {
    const s = lstatSync(parent);
    if (!s.isDirectory() || s.isSymbolicLink() || ![0, process.getuid()].includes(s.uid) ||
      ((s.mode & 0o022) && !(s.uid === 0 && (s.mode & 0o1000)))) refuse();
    if (parent === '/') break;
    parent = dirname(parent);
  }
}
function read(path, maximum = 8 * 1048576) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maximum) refuse();
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const current = fstatSync(fd);
    if (current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size) refuse();
    const buffer = Buffer.alloc(current.size + 1); let length = 0;
    while (length < buffer.length) { const n = readSync(fd, buffer, length, buffer.length - length, null); if (!n) break; length += n; }
    const bytes = buffer.subarray(0, length), after = fstatSync(fd);
    if (bytes.length > maximum || bytes.length !== current.size || after.size !== current.size ||
      after.mtimeMs !== current.mtimeMs || after.ctimeMs !== current.ctimeMs) refuse();
    return bytes;
  } finally { closeSync(fd); }
}
function scan(root, directory = '') {
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) refuse();
  const result = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (!safePath(path) || entry.isSymbolicLink()) refuse();
    if (entry.isDirectory()) result.push(...scan(root, path));
    else if (entry.isFile()) result.push(path);
    else refuse();
    if (result.length > 4096) refuse();
  }
  return result.sort();
}
function write(directory, path, bytes) {
  if (!safePath(path)) refuse();
  mkdirSync(dirname(join(directory, path)), { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, path), bytes, { flag: 'wx', mode: 0o600 });
}
const entry = (path, bytes) => ({ path, size: bytes.length, sha256: sha(bytes) });

export function exportQualifiedBuild({ sourceRoot, sourceTree, workDir, outputDirectory, qualification, nodeImage = NODE_IMAGE }) {
  privateEmpty(outputDirectory);
  if (!isAbsolute(sourceRoot) || !isAbsolute(workDir) || !hex(sourceTree, 40) || nodeImage !== NODE_IMAGE ||
    !relative(sourceRoot, outputDirectory).startsWith('..') ||
    git(sourceRoot, ['cat-file', '-t', sourceTree]).toString().trim() !== 'tree' ||
    qualification?.gate_exit_code !== 0 || qualification.build_command !== 'npm run build' ||
    !testCommand(qualification.test_command) || qualification.restore !== 'PASS' || !hex(qualification.gate_script_sha256)) refuse();
  const frozen = path => git(sourceRoot, ['show', `${sourceTree}:${path}`]);
  if (sha(frozen('scripts/control-api-test.sh')) !== qualification.gate_script_sha256) refuse();
  const sourcePaths = git(sourceRoot, ['ls-tree', '-r', '--name-only', '-z', sourceTree]).toString().split('\0').filter(imageInput).sort();
  if (sourcePaths.length < 7 || sourcePaths.some(path => !safePath(path))) refuse();
  const inputs = sourcePaths.map(path => {
    const bytes = frozen(path);
    if (path !== dockerPath) {
      const copied = path.startsWith(app) ? path.slice(app.length) : path;
      if (!read(join(workDir, copied)).equals(bytes)) refuse();
    }
    return entry(path, bytes);
  });
  for (const dir of ['src', 'migrations']) if (JSON.stringify(scan(join(workDir, dir)).map(path => `${app}${dir}/${path}`)) !==
    JSON.stringify(sourcePaths.filter(path => path.startsWith(`${app}${dir}/`)))) refuse();
  const toolchain = JSON.parse(read(join(workDir, '.qualified-control-api-toolchain.json'), 8192));
  const lock = JSON.parse(frozen(`${app}package-lock.json`)), pkg = JSON.parse(frozen(`${app}package.json`));
  const tsconfigs = ['tsconfig.json', 'tsconfig.build.json'].map(path => JSON.parse(frozen(`${app}${path}`)));
  if (pkg.scripts.build !== 'tsc -p tsconfig.build.json' || toolchain.node_version !== 'v22.23.2' ||
    tsconfigs.some(config => config.compilerOptions?.noCheck || config.compilerOptions?.noEmit || config.compilerOptions?.emitDeclarationOnly) ||
    toolchain.typescript_version !== lock.packages?.['node_modules/typescript']?.version ||
    !hex(toolchain.typescript_js_sha256) || !hex(toolchain.typescript_tsc_sha256) ||
    Object.keys(toolchain).sort().join(',') !== 'node_version,typescript_js_sha256,typescript_tsc_sha256,typescript_version') refuse();
  const distRoot = join(workDir, 'dist'), distPaths = scan(distRoot);
  const required = ['main.js', 'app.module.js', 'execution-v2/native-cache-observation.js',
    'execution-v2/native-core-runtime.js', 'execution-v2/native-core-composition.js', 'cli/execution-native-cache-observation.js'];
  if (required.some(path => !distPaths.includes(path)) || distPaths.some(path => !/\.(?:js|json)$/.test(path))) refuse();
  let total = 0;
  const dist = distPaths.map(path => { const bytes = read(join(distRoot, path)); total += bytes.length;
    if (total > 128 * 1048576 || !sourcePaths.includes(`${app}src/${path.replace(/\.js$/, '.ts')}`)) refuse();
    return { path, bytes }; });
  const contextPaths = sourcePaths.filter(path => path === dockerPath || path === bootstrap || path === `${app}package.json` ||
    path === `${app}package-lock.json` || path.startsWith(`${app}migrations/`) || path === `${app}src/execution-v2/current-human-candidate.sql`);
  const files = contextPaths.map(path => ({ path, bytes: frozen(path) })).concat(dist.map(({ path, bytes }) => ({ path: `dist/${path}`, bytes })));
  const receipt = { schema_version: schema, source_tree: sourceTree, source_inputs: inputs,
    source_inputs_sha256: sha(canonical(inputs)), node_image: nodeImage, toolchain, qualification,
    files: files.map(file => entry(file.path, file.bytes)), provenance: 'SUCCESSFUL_ISOLATED_GATE_OPERATOR_CAPTURE_NOT_CONNECTED_AUTHORITY' };
  for (const file of files) write(outputDirectory, file.path, file.bytes);
  const bytes = canonical(receipt); write(outputDirectory, 'qualification.json', bytes);
  return { receipt_sha256: sha(bytes), source_tree: sourceTree, source_inputs_sha256: receipt.source_inputs_sha256, dist_files: dist.length };
}

export function packageQualifiedBuild({ artifactDirectory, receiptSha256, outputDirectory }) {
  privateEmpty(outputDirectory);
  const raw = read(join(artifactDirectory, 'qualification.json'), 2 * 1048576);
  if (!hex(receiptSha256) || sha(raw) !== receiptSha256) refuse();
  const receipt = JSON.parse(raw);
  if (receipt.schema_version !== schema || receipt.node_image !== NODE_IMAGE || !hex(receipt.source_tree, 40) ||
    sha(canonical(receipt.source_inputs)) !== receipt.source_inputs_sha256 || receipt.qualification?.gate_exit_code !== 0 ||
    receipt.qualification.build_command !== 'npm run build' || !testCommand(receipt.qualification.test_command) ||
    receipt.qualification.restore !== 'PASS' || !Array.isArray(receipt.files) || receipt.files.length > 4096) refuse();
  const expected = receipt.files.map(file => file.path).concat('qualification.json').sort();
  if (new Set(expected).size !== expected.length || JSON.stringify(scan(artifactDirectory)) !== JSON.stringify(expected)) refuse();
  let total = 0;
  const files = receipt.files.map(file => {
    if (!safePath(file.path) || !(imageInput(file.path) || /^dist\/.+\.(?:js|json)$/.test(file.path))) refuse();
    const bytes = read(join(artifactDirectory, file.path));
    total += bytes.length;
    if (total > 160 * 1048576 || bytes.length !== file.size || sha(bytes) !== file.sha256) refuse();
    return { path: file.path, bytes };
  });
  const original = files.find(file => file.path === dockerPath)?.bytes.toString();
  if (!original) refuse();
  const stages = [...original.matchAll(/^FROM .+$/gm)];
  if (stages.length !== 2 || !stages.every(stage => stage[0].includes(NODE_IMAGE.split('@')[1]))) refuse();
  const runtime = original.slice(stages[1].index);
  if (!runtime.includes('USER node') || !runtime.includes('COPY --chown=node:node --from=build /opt/control-api/dist ./dist') ||
    !runtime.includes('CMD ["node", "dist/main.js"]')) refuse();
  const dockerfile = `${stages[0][0]}\nWORKDIR /opt/control-api\nCOPY apps/control-api/package.json apps/control-api/package-lock.json ./\n` +
    'RUN npm ci --no-audit --no-fund && npm prune --omit=dev\nCOPY dist ./dist\n\n' + runtime;
  for (const file of files) write(outputDirectory, file.path, file.bytes);
  write(outputDirectory, 'qualification.json', raw);
  write(outputDirectory, 'Dockerfile.qualified', Buffer.from(dockerfile));
  return { receipt_sha256: receiptSha256, source_tree: receipt.source_tree, dockerfile_sha256: sha(Buffer.from(dockerfile)),
    runtime_stage_sha256: sha(Buffer.from(runtime)), qualification: 'PACKAGING_ONLY_NOT_IMAGE_OR_CONNECTED_PASS' };
}

function cli(argv) {
  const [command, ...args] = argv, values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith('--') || values.has(args[i]) || !args[i + 1]) refuse();
    values.set(args[i], args[i + 1]);
  }
  const keys = command === 'capture' ? ['--source-root', '--source-tree', '--work-dir', '--output-dir', '--gate-script-sha256', '--test-command'] :
    command === 'package' ? ['--artifact-dir', '--receipt-sha256', '--output-dir'] : [];
  if (!keys.length || keys.length !== values.size || keys.some(key => !values.has(key))) refuse();
  return command === 'capture' ? exportQualifiedBuild({ sourceRoot: values.get('--source-root'), sourceTree: values.get('--source-tree'),
    workDir: values.get('--work-dir'), outputDirectory: values.get('--output-dir'), qualification: {
      gate_script_sha256: values.get('--gate-script-sha256'), gate_exit_code: 0, build_command: 'npm run build', test_command: values.get('--test-command'), restore: 'PASS' } }) :
    packageQualifiedBuild({ artifactDirectory: values.get('--artifact-dir'), receiptSha256: values.get('--receipt-sha256'), outputDirectory: values.get('--output-dir') });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(cli(process.argv.slice(2)))}\n`); }
  catch { process.stderr.write('QUALIFIED_CONTROL_API_IMAGE_REFUSED\n'); process.exitCode = 1; }
}
