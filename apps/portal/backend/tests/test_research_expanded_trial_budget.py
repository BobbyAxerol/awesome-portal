"""Range authority regression; unit facts are not product-run qualification."""
from dataclasses import replace
from types import SimpleNamespace

import pytest

from portal_api.domain.research_execution_recipes import execution_recipe
from portal_api.domain.research_trial_budget import admitted_study_trials, admitted_total_trials, child_study_trials
from portal_api.domain.research_full03_profiles import full03_execution_binding
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.services.research_supervisor import IsolatedResearchSupervisor, ResearchChildLimits, ResearchSupervisorError
from portal_api.services.research_progress import ResearchProgressError, ResearchProgressJournal
from portal_api.services.current_source_artifacts import CurrentSourceArtifactAdapter, CurrentSourceArtifactError
from portal_api.workers.durable_worker import _p11_cpu_cap, DurableQuantWorker
from test_research_full03_child import full03_request, bind_full03_work, _receipt


@pytest.mark.parametrize('trials',(2,3,100,400))
def test_expanded_work_carries_requested_trials_and_immutable_digest(trials):
    doc=full03_request('p10.delta-wfo-temporal-1h.v2')
    doc['research']['requested_spec']['optuna_trials']=trials
    bind_full03_work(doc)
    model=ResearchRunProducerRequest.model_validate(doc)
    assert model.research.requested_spec['optuna_trials']==trials


@pytest.mark.parametrize('value',(True,0,1,401,2.5,'400',None))
def test_invalid_trial_inputs_never_coerce(value):
    row=execution_recipe('p10.delta-wfo-temporal-1h.v2')
    with pytest.raises(ValueError):
        admitted_study_trials(row,value)


def test_centroid_minimum_and_fold_total_caps():
    row=execution_recipe('p10.delta-mode3-global-1h.v2')
    with pytest.raises(ValueError): admitted_study_trials(row,3)
    assert admitted_total_trials(row,400,1)==400
    causal=execution_recipe('p10.delta-causal-inner-1h.v2')
    assert admitted_total_trials(causal,400,16)==6400
    with pytest.raises(ValueError): admitted_total_trials(causal,400,17)


def test_receipt_binds_trials_and_old_profiles_cannot_inherit_new_range(tmp_path):
    receipt=_receipt(tmp_path,timeframe='1h')
    row=execution_recipe('p10.delta-wfo-temporal-1h.v2')
    expanded=replace(receipt,execution_profile_id=row['profile_id'],execution_profile_digest=row['profile_digest'],
        execution_binding=full03_execution_binding(row),optuna_trials=100)
    payload=expanded.as_payload(output_root=tmp_path/'output')
    assert child_study_trials(row,payload)==100
    with pytest.raises(ResearchSupervisorError):
        replace(expanded,optuna_trials=None).as_payload(output_root=tmp_path/'output')
    with pytest.raises(ResearchSupervisorError):
        replace(receipt,optuna_trials=100).as_payload(output_root=tmp_path/'output')
    with pytest.raises(ValueError):
        child_study_trials(execution_recipe(receipt.execution_profile_id),{'optuna_trials':100})


def test_raised_resource_limits_require_exact_descriptor_scope(monkeypatch):
    monkeypatch.delenv('PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO',raising=False)
    limits=ResearchChildLimits(cpu_seconds=1800,wall_seconds=2400,scratch_bytes=512*1024**2)
    with pytest.raises(ResearchSupervisorError): limits.validate()
    limits.validate(recipe_profile_id='p10.delta-wfo-temporal-1h.v2')
    with pytest.raises(ResearchSupervisorError): limits.validate(recipe_profile_id='p10.delta-wfo-temporal-1h.v1')
    with pytest.raises(ResearchSupervisorError):
        replace(limits,cpu_seconds=1801).validate(recipe_profile_id='p10.delta-wfo-temporal-1h.v2')


def test_progress_cpu_cap_requires_exact_immutable_recipe(tmp_path, monkeypatch):
    monkeypatch.delenv('PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO', raising=False)
    row = execution_recipe('p10.delta-wfo-temporal-1h.v2')
    kwargs = dict(run_id='rrun_expanded', attempt_id='ra_expanded', lease_epoch=1,
                  planned_trials=400, cpu_cap_seconds=1800, profile='DELTA_WFO')
    with pytest.raises(ResearchProgressError, match='CPU cap'):
        ResearchProgressJournal(tmp_path, **kwargs)
    with pytest.raises(ResearchProgressError, match='immutable recipe'):
        ResearchProgressJournal(tmp_path, **kwargs, execution_profile_id=row['profile_id'],
                                execution_profile_digest='0' * 64)
    old = execution_recipe('p10.delta-wfo-temporal-1h.v1')
    with pytest.raises(ResearchProgressError, match='CPU cap'):
        ResearchProgressJournal(tmp_path, **kwargs, execution_profile_id=old['profile_id'],
                                execution_profile_digest=old['profile_digest'])
    journal = ResearchProgressJournal(tmp_path, **kwargs, execution_profile_id=row['profile_id'],
                                      execution_profile_digest=row['profile_digest'])
    assert journal.cpu_cap_seconds == 1800


def test_imported_optimizer_terminal_usage_keeps_its_admitted_cap(tmp_path):
    row = execution_recipe('p10.imported-wfo-temporal-1h.v2')
    research = SimpleNamespace(is_final_audit=False, is_whatif=False,
        is_delta_wfo=True, is_native_fixed=False, is_imported_alpha=True)
    cap = _p11_cpu_cap(research, row['budgets']['cpu_seconds'])
    assert cap == 1800
    journal = ResearchProgressJournal(tmp_path, run_id='rrun_imported_cap',
        attempt_id='ra_imported_cap', lease_epoch=1, planned_trials=100,
        cpu_cap_seconds=cap, profile='IMPORTED_ALPHA',
        execution_profile_id=row['profile_id'], execution_profile_digest=row['profile_digest'])
    journal.emit('run_started')
    usage = DurableQuantWorker._p11_usage({'research_receipt': {'resource':
        {'cpu_seconds': 145.5, 'peak_rss_bytes': 1024}}}, cpu_cap_seconds=cap)
    assert usage['cpu_seconds'] == 146
    with pytest.raises(ResearchProgressError, match='terminal usage'):
        journal.emit('run_completed', {'usage': {**usage, 'cpu_seconds': cap + 1}})
    journal.mark_mandatory_sealed(bundle_digest='a' * 64, bundle_bytes=12)
    terminal = journal.emit('run_completed', {'usage': usage})
    assert terminal['event']['payload']['usage']['cpu_seconds'] == 146
    assert terminal['snapshot']['status'] == 'COMPLETED'
    research.is_delta_wfo = False
    assert _p11_cpu_cap(research, 1800) == 120, 'Legacy imported fixed cap is unchanged.'


@pytest.mark.parametrize('route', ('intrabar-bracket', 'reactive', 'event-driven'))
def test_native_progress_cpu_cap_is_exact_and_digest_bound(route):
    row = execution_recipe(f'p10.delta-{route}-fixed-1h.v3')
    research = SimpleNamespace(is_final_audit=False, is_whatif=False,
        is_delta_wfo=False, is_native_fixed=True, is_imported_alpha=False,
        execution_profile_id=row['profile_id'], execution_profile_digest=row['profile_digest'])
    assert _p11_cpu_cap(research, 1800) == row['budgets']['cpu_seconds'] == 90
    research.execution_profile_digest = '0' * 64
    with pytest.raises(ValueError):
        _p11_cpu_cap(research, 1800)


def test_supervisor_validates_returned_count_with_bound_output_receipt(tmp_path, monkeypatch):
    old = _receipt(tmp_path, timeframe='1h')
    row = execution_recipe('p10.delta-wfo-temporal-1h.v2')
    receipt = replace(old, execution_profile_id=row['profile_id'], execution_profile_digest=row['profile_digest'],
                      execution_binding=full03_execution_binding(row), optuna_trials=100)
    supervisor = IsolatedResearchSupervisor(tmp_path / 'scratch', allowed_market_root=tmp_path)
    def launch(**kwargs):
        work = tmp_path / 'fake-launch'; work.mkdir()
        bound = kwargs['payload_for'](work)
        assert bound['optuna_trials'] == 100
        return SimpleNamespace(payload=dict(engine_version='1.1.1', bars=1000, n_folds=2, trial_rows=100,
                 execution_profile_digest=row['profile_digest']), launcher_pid=2, child_pid=3,
                 network_namespace='unit-only', elapsed_seconds=1, peak_rss_bytes=1024,
                 cpu_seconds=1, enforced_limits={})
    monkeypatch.setattr(supervisor, '_launch', launch)
    monkeypatch.setattr(supervisor, '_validate_output_tree', lambda *args, **kwargs: (1, 1))
    result = supervisor.run_delta_wfo(receipt, limits=ResearchChildLimits(cpu_seconds=1800, wall_seconds=2400,
                                      scratch_bytes=512 * 1024**2))
    assert result.trial_rows == 100


def test_retention_count_bounds_use_exact_recipe_not_legacy_64_row_limit():
    values = dict(observations=[{}] * 1000, folds=[{}, {}], trials=[{}] * 100,
                  candidates=[{}], selection=[{}])
    CurrentSourceArtifactAdapter._assert_admitted_output_bounds(
        **values, recipe=execution_recipe('p10.delta-wfo-temporal-1h.v2'))
    with pytest.raises(CurrentSourceArtifactError, match='trials relation'):
        CurrentSourceArtifactAdapter._assert_admitted_output_bounds(
            **values, recipe=execution_recipe('p10.delta-wfo-temporal-1h.v1'))


def test_three_window_recipe_uses_its_one_engine_fold_not_wfo_bounds():
    values = dict(observations=[{}] * 1000, folds=[{}], trials=[{}] * 100,
                  candidates=[{}], selection=[{}], three_window=True)
    CurrentSourceArtifactAdapter._assert_admitted_output_bounds(
        **values, recipe=execution_recipe('p10.delta-three-window-optimized-1h.v2'))
    with pytest.raises(CurrentSourceArtifactError, match='folds relation'):
        CurrentSourceArtifactAdapter._assert_admitted_output_bounds(
            **{**values, 'folds': [{}, {}]}, recipe=execution_recipe('p10.delta-three-window-optimized-1h.v2'))
