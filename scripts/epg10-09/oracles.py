#!/usr/bin/env python3
"""Run exact existing Research tests and guide reference, never a new calculator.

Execute only from the phase's private SGP target after its PG qualification.
Correctness activity is nonexclusive; no host measurement lease is claimed.
Reads committed, hash-pinned source; no peer checkout/cache mutation.
The node_modules symlink is an existing dependency reference, not vendored code.
All policy/financial examples remain TEST_ONLY; no production calibration proof.
"""
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

REVISION = '630eafc563159305727bab7c588a27da27df827f'
RESEARCH = Path('/home/bobby/portal-research')
PINS = {
    'apps/control-api/src/execution-v2/manager-score.ts':
        '152fcc02c10726f4870aa1238a2142f35cc187b60e3bd49cd915f803c8734193',
    'apps/control-api/src/research/exact-decimal.ts':
        'f7edb5b1f3bd16f7fe8c8d3b70d4e5018b340143dd1f4ecab6902ec7563cd613',
    'apps/control-api/test/elp206-manager-score.spec.ts':
        'd87dab64a4b448ef3c8dd864edebd20463df099fbcb370a32a174f291d896381',
    'upgrade/execution_loop/SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md':
        'd77a05fc0c6b481114c0d4055a2ff0c09f6b7a3cc0ca1447f691d92f139adbad',
}


def reference_block(data):
    if len(data) > 256 * 1024 or hashlib.sha256(data).hexdigest() != PINS[
            'upgrade/execution_loop/SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md']:
        raise ValueError('EXACT_APPROVED_GUIDE_REQUIRED')
    blocks = data.decode('utf-8').split('```python\n')
    if len(blocks) != 2 or '\n```' not in blocks[1]:
        raise ValueError('EXACT_SINGLE_REFERENCE_BLOCK_REQUIRED')
    return blocks[1].split('\n```', 1)[0]


def rolling_peak_exit(reference):
    """Test the approved function, not an Edge drawdown implementation."""
    check = unittest.TestCase()
    mdd, add = reference.drawdowns([.5, -.2, .1])
    check.assertAlmostEqual(mdd, .2)
    check.assertAlmostEqual(add, .10666666666666667)
    # The old .12 drawdown cannot be retained when its peak leaves the window.
    check.assertEqual(reference.drawdowns([.1]), (0., 0.))


def main():
    os.umask(0o077)
    base = Path(__file__).absolute().parent
    sys.path.insert(0, str(base))
    import run as runner
    import execution_edge_observe as observer
    runner.validate_base(base, '09')
    target = base / 'oracle'
    target.mkdir(mode=0o700)  # no accidental re-run over a prior snapshot
    receipt = dict(schema='epg10.shared-oracles.v1', status='FAIL',
        at_utc=datetime.now(timezone.utc).isoformat(), provenance='TEST_ONLY',
        performance_acceptance=False, production_calibration=False,
        runtime_mutations=0, source_revision=REVISION, input_sha256=PINS)
    owner = 'codex-epg10-09-shared-oracles'
    activity_path = observer.ACTIVITY_DIR / (owner + '.json')
    with observer.correctness_activity(activity_path, owner=owner, seconds=600,
            purpose='EPG10-09 exact shared Research/reference correctness; no capacity claim',
            cpu_cap=1) as activity:
        receipt['correctness_activity'] = activity
        receipt['correctness_activity_window_seconds'] = 600
        try:
            original = json.loads((base / 'receipt.json').read_text())
            if original['status'] != 'PASS_ISOLATED_CORRECTNESS_ONLY':
                raise ValueError('FULL_RUST_PG_QUALIFICATION_REQUIRED')
            if runner.source_hashes(base / 'source', '09') != original['input_hashes']:
                raise ValueError('FULL_RUN_RUST_INPUTS_CHANGED')
            # Recheck safety and bind this oracle run to the final full PG
            # qualification. Repeated helper tests are not additional unique
            # application coverage; no changed Rust bytes may reuse the receipt.
            observer.verify_activity(activity_path, activity)
            checked = subprocess.run([sys.executable, '-B', '-m', 'unittest', '-v', 'test_run'],
                cwd=base, env=runner.isolated_environment(base), stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, timeout=30, check=False)
            if len(checked.stdout) > 128 * 1024 or checked.returncode:
                raise ValueError('FINAL_RUNNER_SAFETY_FAILED')
            receipt['final_runner_safety'] = runner.parse_safety_results(checked.stdout.decode())
            receipt['full_run_rust_inputs_unchanged'] = True
            receipt['final_runner_hashes'] = {name: hashlib.sha256((base / name).read_bytes()).hexdigest()
                for name in ('run.py', 'test_run.py', 'epg03_run.py', 'execution_edge_observe.py')}
            guide = None
            for name, expected in PINS.items():
                observer.verify_activity(activity_path, activity)
                data = subprocess.check_output(['git', '-C', str(RESEARCH), 'show', REVISION + ':' + name], timeout=15)
                if len(data) > 256 * 1024 or hashlib.sha256(data).hexdigest() != expected:
                    raise ValueError('SHARED_SOURCE_PIN_CHANGED')
                if name.endswith('.md'):
                    guide = data
                else:
                    relative = Path(name).relative_to('apps/control-api')
                    destination = target / relative
                    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    destination.write_bytes(data)
            block = reference_block(guide)
            observer.verify_activity(activity_path, activity)
            namespace = {'__name__': 'epg10_exact_reference'}
            # Dataclasses need a registered module for postponed type lookups.
            module = importlib.util.module_from_spec(importlib.util.spec_from_loader(namespace['__name__'], loader=None))
            sys.modules[namespace['__name__']] = module
            exec(compile(block, 'HASH_PINNED_FINAL_REFERENCE', 'exec'), module.__dict__)
            suite = unittest.defaultTestLoader.loadTestsFromTestCase(module.ScoreTests)
            output = io.StringIO()
            result = unittest.TextTestRunner(stream=output).run(suite)
            (target / 'reference.private.log').write_text(output.getvalue())
            receipt['reference'] = dict(passed=result.testsRun - len(result.failures) - len(result.errors),
                failed=len(result.failures) + len(result.errors), skipped=len(result.skipped),
                reference_block_sha256=hashlib.sha256(block.encode()).hexdigest())
            if not result.wasSuccessful() or result.testsRun != 47 or result.skipped:
                raise ValueError('EXACT_47_REFERENCE_TESTS_REQUIRED')
            rolling_peak_exit(module)
            receipt['rolling_peak_exit_reference_regression'] = dict(passed=1, failed=0,
                provenance='TEST_ONLY_CALL_TO_EXACT_SHARED_REFERENCE_NOT_NEW_FORMULA')
            dependency = RESEARCH / 'apps/control-api/node_modules'
            # Never symlink the entire dependency directory: Vite may create
            # node_modules/.vite-temp while loading config, independently of
            # cacheDir. Only the immutable imported vitest package is linked.
            (target / 'node_modules').mkdir(mode=0o700)
            (target / 'node_modules/vitest').symlink_to(dependency / 'vitest', target_is_directory=True)
            receipt['research_dependency_version'] = json.loads((dependency / 'vitest/package.json').read_text())['version']
            receipt['cache_scope'] = 'PRIVATE_TARGET_ONLY_INCLUDING_NODE_MODULES_VITE_TEMP'
            config = target / 'vitest.config.mjs'
            config.write_text('export default ' + json.dumps({
                'cacheDir': str(target / '.vite'), 'test': {'cache': False}}) + ';\n')
            command = ['node', str(dependency / 'vitest/vitest.mjs'), 'run',
                '--root', str(target), '--config', str(config), '--maxWorkers=1', '--no-file-parallelism',
                '--reporter=json',
                'test/elp206-manager-score.spec.ts']
            observer.verify_activity(activity_path, activity)
            # JSON goes through the same bounded pipe as diagnostics: no
            # independently unbounded --outputFile. The existing runner kills
            # the complete process group on timeout or its 8 MiB log ceiling.
            report = target / 'vitest.private.log'
            receipt['vitest_stage'] = runner.run_logged(
                ['nice', '-n', '15', 'taskset', '--cpu-list',
                    str(min(os.sched_getaffinity(0))), *command], report, cwd=target,
                env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'CI': '1', 'TZ': 'UTC'},
                timeout=180, check=False)
            if not report.exists() or report.stat().st_size > 1024 * 1024:
                raise ValueError('BOUNDED_VITEST_RECEIPT_REQUIRED')
            value = json.loads(report.read_text())
            receipt['research'] = {key: value.get(key) for key in (
                'numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'success')}
            receipt['research']['test_names'] = [row['fullName'] for group in value['testResults']
                for row in group['assertionResults']]
            if (receipt['vitest_stage']['returncode'] or not value['success'] or not value['numTotalTests']
                    or value['numFailedTests'] or value['numPendingTests']):
                raise ValueError('SHARED_RESEARCH_TESTS_FAILED')
            # Fail-closed extraction control: altered bytes cannot execute.
            try:
                reference_block(guide + b'\nALTERED')
            except ValueError:
                receipt['altered_guide_denied'] = True
            else:
                raise ValueError('HASH_GUARD_FAILED')
            for name, expected in PINS.items():
                if name.endswith('.ts'):
                    copied = target / Path(name).relative_to('apps/control-api')
                    if hashlib.sha256(copied.read_bytes()).hexdigest() != expected:
                        raise ValueError('SHARED_INPUT_CHANGED_DURING_TEST')
            receipt['source_input_unchanged'] = True
            receipt['runner_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
            observer.verify_activity(activity_path, activity)
            receipt['status'] = 'PASS_SHARED_TEST_ONLY_ORACLES'
        except Exception as exc:
            receipt['error_type'] = type(exc).__name__
    (base / 'oracles-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({key: value for key, value in receipt.items() if key != 'input_sha256'}))
    return 0 if receipt['status'] == 'PASS_SHARED_TEST_ONLY_ORACLES' else 1


if __name__ == '__main__':
    raise SystemExit(main())
