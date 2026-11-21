/** Synthetic wire predicates, not engine or product qualification. */
import {describe,it,expect} from 'vitest';
import {CurrentSourceProtocolDisclosureSchema} from '../src/research/current-source.payload';
function disclosure(){
  const roles=['is','oos','holdout'] as const;
  const windows=Object.fromEntries(roles.map((role,i)=>[role,{start_utc_ms:i*100000,
    end_exclusive_utc_ms:(i+1)*100000,bar_count:100}]));
  const series=Object.fromEntries(roles.map((role,i)=>[role,[i*100000,i*100000+99000].map(at=>({
    at_utc_ms:at,equity:'100.01',return_fraction:'0',drawdown_fraction:'0',accepted_position:'0',signal_target:null}))]));
  return {schema_version:'research.current-source-protocol-disclosure.v1',protocol:'three_window_decay',
    engine_operation:'train_test_split',calibration_scope:'IS_OOS_ONLY',observation_scope:'OOS_SELECTION_INPUT',
    windows,window_series:series,independent_holdout:{...windows.holdout,state:'AVAILABLE',holdout_used_for_selection:false,
      selected_params_digest:'a'.repeat(64),freeze_before_holdout:true},
    window_series_metadata:Object.fromEntries(roles.map(role=>[role,{source_observation_count:100,
      emitted_point_count:2,sampling:'MULTI_SERIES_EXTREMA_V1'}]))};
}
describe('FULL03 exact display sampling',()=>{
  it('accepts counts bound to unchanged source window facts and legacy absence',()=>{
    const value=disclosure();expect(CurrentSourceProtocolDisclosureSchema.safeParse(value).success).toBe(true);
    const {window_series_metadata:_,...legacy}=value;
    expect(CurrentSourceProtocolDisclosureSchema.safeParse(legacy).success).toBe(true);
  });
  it.each([{emitted_point_count:3},{source_observation_count:99},{sampling:'FULL'}])('refuses deceptive coverage %j',change=>{
    const value=disclosure();Object.assign(value.window_series_metadata.is,change);
    expect(CurrentSourceProtocolDisclosureSchema.safeParse(value).success).toBe(false);
  });
});
