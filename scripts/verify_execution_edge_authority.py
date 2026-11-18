#!/usr/bin/env python3
"""Offline EPG10-00 metadata checks, never runtime admission or business authority.

Python is existing repository verification tooling, not an Edge runtime dependency.
No network, DB, Docker, file writes or third-party packages. Run from any directory.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / 'upgrade/evidence/execution-edge-v1_2/EPG10-00/source-runtime-manifest.json'
GATES = {
    'P184_PERFORMANCE_G2': 'performance_latency_500ms',
    'P19_MAINNET_G2': 'optional_explicit_mainnet_request',
    'N1_F1': 'native_consumer_failure_recovery',
    'P16_ISOLATED': 'isolated_source_publication',
    'P16_FULL_DB': 'full_target_database_publication',
    'P_LANES': 'dataset_scoped_partner_acceptance',
    'XLC': 'cross_guide_acceptance',
}


def digest(value, size=64):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{%d}' % size, value) is not None


def validate(m):
    if not isinstance(m, dict):
        return ['MANIFEST_OBJECT_REQUIRED']
    errors = []

    def require(condition, code):
        if not condition:
            errors.append(code)

    require(m.get('schema') == 'epg10.source-authority-inventory.v1', 'SCHEMA')
    require(m.get('evidence_class') == 'READ_ONLY_METADATA_NOT_RUNTIME_ACCEPTANCE', 'EVIDENCE_CLASS')
    repos = m.get('repositories', [])
    ids = [r.get('id') for r in repos]
    require(bool(repos) and len(ids) == len(set(ids)), 'REPOSITORY_IDS')
    require({'edge_upgrade', 'portal_hk_canonical', 'ts_next', 'ts_alternate',
             'ts_pm', 'dl_closure', 'ts_canonical', 'dl_canonical',
             'portal_canonical', 'research_be', 'research_fe', 'research_docs',
             'portal_stable', 'portal_integration'} <= set(ids), 'REQUIRED_SOURCE_PINS')
    for r in repos:
        name = r.get('id', '?')
        require(bool(r.get('branch')) and bool(r.get('path'))
                and bool(r.get('observed_at')), name + ':SOURCE_LOCATION')
        require(digest(r.get('commit'), 40), name + ':FULL_SHA')
        require(r.get('commit') == r.get('observed_commit'), name + ':SHA_MISMATCH')
        for key in ('staged_diff_sha256', 'unstaged_diff_sha256', 'untracked_paths_sha256'):
            require(digest(r.get(key)), name + ':' + key)
        files = r.get('relevant_untracked', [])
        require(isinstance(files, list), name + ':UNTRACKED_LIST')
        for f in files:
            require(bool(f.get('path')) and digest(f.get('sha256')), name + ':UNTRACKED_CONTENT')
        require(r.get('untracked_count', -1) == len(files) + r.get('excluded_untracked_count', 0),
                name + ':UNTRACKED_COVERAGE')
        if r.get('excluded_untracked_count', 0):
            require(bool(r.get('exclusion_reason')), name + ':EXCLUSION_REASON')
    source_files = m.get('source_files', [])
    require(isinstance(source_files, list) and bool(source_files), 'SOURCE_FILES_REQUIRED')
    require({'edge_upgrade', 'ts_next', 'ts_pm', 'dl_closure', 'research_be'}
            <= {f.get('repository') for f in source_files}, 'INTERFACE_SOURCE_COVERAGE')
    for f in source_files:
        require(f.get('repository') in ids and bool(f.get('path')) and digest(f.get('sha256')),
                'SOURCE_FILE_PIN')
    schema = m.get('applied_schema', {})
    if schema.get('status') == 'VERIFIED':
        require(schema.get('evidence_type') == 'TARGET_DB_METADATA_AND_LEDGER'
                and digest(schema.get('receipt_sha256')) and bool(schema.get('target_ref')),
                'MIGRATION_SOURCE_IS_NOT_APPLIED_SCHEMA')
    else:
        require(schema.get('status') == 'UNKNOWN' and bool(schema.get('owner'))
                and bool(schema.get('blocker')), 'APPLIED_SCHEMA_UNKNOWN_OWNER')
    membership = m.get('human_membership', {})
    require(isinstance(membership, dict) and type(membership.get('verified')) is bool,
            'HUMAN_MEMBERSHIP_REQUIRED')
    if membership.get('verified'):
        require(membership.get('basis') == 'CURRENT_TS_VERIFIED_USER_MEMBERSHIP'
                and bool(membership.get('current_human_lease_ref'))
                and bool(membership.get('current_business_revision_ref')),
                'OWNER_TEXT_OR_WORKLOAD_TOKEN_IS_NOT_MEMBERSHIP')
    else:
        require(bool(membership.get('owner')) and bool(membership.get('blocker')),
                'UNVERIFIED_MEMBERSHIP_OWNER_BLOCKER')
    publications = m.get('publication', [])
    require(isinstance(publications, list) and len(publications) == 3
            and {p.get('id') for p in publications}
            == {'N03_P16_EXTERNAL', 'PM_FULL_EXPORT', 'LEGACY_MANAGER_CURRENT'},
            'PUBLICATION_INVENTORY_REQUIRED')
    for p in publications:
        require(bool(p.get('owner')) and bool(p.get('status'))
                and type(p.get('pending')) is bool
                and type(p.get('runtime_certified')) is bool
                and type(p.get('new_live_activation')) is bool,
                'PUBLICATION_DISPOSITION_REQUIRED')
        if p.get('runtime_certified') or p.get('new_live_activation'):
            require(p.get('owner_accepted') is True and digest(p.get('runtime_receipt_sha256'))
                    and p.get('tls_verified') is True and p.get('pending') is False,
                    'PENDING_ARTIFACT_IS_NOT_PUBLICATION')
    gates = m.get('gates', {})
    require(set(gates) == set(GATES), 'GATE_NAMESPACES')
    for key, meaning in GATES.items():
        g = gates.get(key, {})
        require(g.get('meaning') == meaning and bool(g.get('owner')), key + ':SCOPE')
        require(g.get('status') in ('RUNNING', 'SCOPED_JOURNAL_ONLY', 'UNVERIFIED', 'NOT_RUN'),
                key + ':NO_PROMOTION_WITHOUT_NEW_RECEIPT')
    require(m.get('scope', {}).get('runtime_activation_authorized') is False, 'INVENTORY_ONLY')
    require(m.get('scope', {}).get('all_scope_ready') is False, 'NO_GLOBAL_READINESS')
    require(m.get('source_map_family_count') == 39, 'GUIDE_FAMILY_CENSUS')
    decisions = m.get('decisions', [])
    require(len(decisions) == 15 and {d.get('id') for d in decisions}
            == {'DEC-E%02d' % i for i in range(1, 16)}, 'DECISION_COVERAGE')
    return errors


def check_local(m):
    """Recheck pinned interface bytes; inspect peers without updating refs/indexes.

    Our own source commit is an ancestor: this phase adds the inventory on top.
    Every producer pin, and every reviewed interface byte, must still match.
    Remote attestations are explicitly not reattested by this local-only check.
    """
    errors = []
    repos = {r['id']: r for r in m['repositories']}
    for name, r in repos.items():
        if r['host'] != 'AWS_HK':
            continue
        path = Path(r['path'])
        if name == 'edge_upgrade':
            result = subprocess.run(['git', '-C', str(path), 'merge-base', '--is-ancestor',
                                     r['commit'], 'HEAD'], capture_output=True)
            if result.returncode:
                errors.append(name + ':BASE_NOT_ANCESTOR')
        else:
            head = subprocess.check_output(['git', '-C', str(path), 'rev-parse', 'HEAD'], text=True).strip()
            if head != r['commit']:
                errors.append(name + ':REPIN_REQUIRED')
            for key, flags in (('staged_diff_sha256', ['--cached']),
                               ('unstaged_diff_sha256', [])):
                diff = subprocess.check_output(['git', '-C', str(path), 'diff', *flags,
                                                '--binary', '--no-ext-diff'])
                if hashlib.sha256(diff).hexdigest() != r[key]:
                    errors.append(name + ':' + key + ':REPIN_REQUIRED')
            untracked = subprocess.check_output(['git', '-C', str(path), 'ls-files',
                                                 '--others', '--exclude-standard', '-z'])
            if hashlib.sha256(untracked).hexdigest() != r['untracked_paths_sha256']:
                errors.append(name + ':UNTRACKED_REPIN_REQUIRED')
            for f in r['relevant_untracked']:
                source = path / f['path']
                if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != f['sha256']:
                    errors.append(name + ':UNTRACKED_BYTES_CHANGED')
    for f in m['source_files']:
        r = repos[f['repository']]
        if r['host'] != 'AWS_HK':
            continue
        path = Path(r['path']) / f['path']
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != f['sha256']:
            errors.append(f['repository'] + ':' + f['path'] + ':BYTES_CHANGED')
    return errors


def self_test(m):
    """Six required case IDs; each includes positive baseline + hostile variants."""
    if validate(m):
        raise ValueError('Baseline invalid: ' + ', '.join(validate(m)))

    def rejects(change, code):
        candidate = copy.deepcopy(m)
        change(candidate)
        if not any(code in error for error in validate(candidate)):
            raise AssertionError('Accepted invalid evidence: ' + code)

    rejects(lambda x: x['repositories'][0].update(commit='1234567'), 'FULL_SHA')
    rejects(lambda x: x['repositories'][0].update(commit='0' * 40), 'SHA_MISMATCH')
    rejects(lambda x: x.pop('source_files'), 'SOURCE_FILES_REQUIRED')
    rejects(lambda x: x['applied_schema'].update(status='VERIFIED', evidence_type='SOURCE_MIGRATION'),
            'MIGRATION_SOURCE_IS_NOT_APPLIED_SCHEMA')
    for basis in ('OWNER_TEXT', 'SHARED_ADMIN_TOKEN'):
        rejects(lambda x: x['human_membership'].update(verified=True, basis=basis),
                'OWNER_TEXT_OR_WORKLOAD_TOKEN_IS_NOT_MEMBERSHIP')
    rejects(lambda x: x.pop('human_membership'), 'HUMAN_MEMBERSHIP_REQUIRED')
    rejects(lambda x: x['human_membership'].pop('blocker'), 'UNVERIFIED_MEMBERSHIP_OWNER_BLOCKER')
    for flag in ('runtime_certified', 'new_live_activation'):
        rejects(lambda x: x['publication'][0].update({flag: True}),
                'PENDING_ARTIFACT_IS_NOT_PUBLICATION')
    rejects(lambda x: x.pop('publication'), 'PUBLICATION_INVENTORY_REQUIRED')
    rejects(lambda x: x.update(publication=[]), 'PUBLICATION_INVENTORY_REQUIRED')
    rejects(lambda x: x['repositories'][0].pop('unstaged_diff_sha256'), 'unstaged_diff_sha256')
    dirty_index = next(i for i, r in enumerate(m['repositories']) if r['relevant_untracked'])
    rejects(lambda x: x['repositories'][dirty_index]['relevant_untracked'][0].pop('sha256'),
            'UNTRACKED_CONTENT')
    rejects(lambda x: x['gates']['P184_PERFORMANCE_G2'].update(
        meaning=GATES['P19_MAINNET_G2']), 'P184_PERFORMANCE_G2:SCOPE')
    for gate in GATES:
        rejects(lambda x: x['gates'][gate].update(status='PASS'),
                'NO_PROMOTION_WITHOUT_NEW_RECEIPT')
    rejects(lambda x: x['scope'].update(all_scope_ready=True), 'NO_GLOBAL_READINESS')
    rejects(lambda x: x['decisions'][0].update(id='DEC-E02'), 'DECISION_COVERAGE')
    return [{'id': 'EPG10-T00-%02d' % i, 'status': 'PASS'} for i in range(1, 7)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=DEFAULT)
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--check-local', action='store_true')
    args = parser.parse_args()
    try:
        manifest = json.loads(args.manifest.read_text())
        errors = validate(manifest)
        if not errors and args.check_local:
            errors.extend(check_local(manifest))
        cases = self_test(manifest) if args.self_test and not errors else []
        print(json.dumps({'status': 'FAIL' if errors else 'PASS', 'errors': errors,
                          'cases': cases, 'runtime_acceptance': False,
                          'remote_reattestation': False}, sort_keys=True))
        return bool(errors)
    except (ValueError, KeyError, TypeError, AttributeError, OSError, AssertionError,
            subprocess.SubprocessError) as exc:
        print(json.dumps({'status': 'FAIL', 'error': str(exc), 'runtime_acceptance': False}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
