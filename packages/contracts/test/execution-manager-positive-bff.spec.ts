import { describe, it, expect } from 'vitest';
import { answerReviewManager } from '../../../apps/portal/fixture-bff/review-manager';
import { managerSeriesResponse } from '../../../apps/control-api/src/execution-v2/manager-series.contract';
function read(metric: string, profile: 'populated' | 'layout-stress' = 'populated', workspace?: string) {
  const query = new URLSearchParams({environment:'paper', metric, window:JSON.stringify('30D'), subjects:JSON.stringify([{subject_type:'PORTFOLIO',subject_id:'TEST_ONLY:portfolio-a'}])});
  if(workspace) query.set('workspace_id', workspace);
  const response=answerReviewManager('GET','/manager/series',query,profile);
  expect(response?.status).toBe(200);
  return response!.body as any;
}
describe('populated BFF positive series',()=>{
  it('preserves deliberately unavailable and empty scenarios',()=>{
    const absent=read('NAV','populated','ws_TEST_SERIES_UNAVAILABLE');
    expect(absent.series_source.state).toBe('NOT_PUBLISHED');
    const empty=read('NAV','populated','ws_TEST_SERIES_EMPTY');
    expect(empty.series.every((entry:any)=>entry.state==='EMPTY')).toBe(true);
  });
  it.each(['populated','layout-stress'] as const)('%s produces complete bounded series in all metrics',profile=>{
    for(const metric of ['NAV','NET_PNL','RETURN','DRAWDOWN']) {
      const body=read(metric,profile), parsed=managerSeriesResponse.safeParse(body);
      expect(parsed.success, JSON.stringify(parsed)).toBe(true);
      expect(body.quality.completeness).toBe('COMPLETE');
      expect(body.series[0].gaps).toEqual([]);
      expect(body.series[0].points).toHaveLength(profile==='populated'?240:1440);
      expect(body.series[0].points.at(-1).ts_ms).toBe(body.series[0].window.to_ms-1);
    }
  });
  it('derives drawdown from exactly the NAV walk',()=>{
    const nav=read('NAV').series[0], dd=read('DRAWDOWN').series[0];
    let peak=0;
    for(let i=0;i<nav.points.length;i++) {
      const value=Number(nav.points[i].value); peak=Math.max(peak,value);
      expect(dd.points[i].ts_ms).toBe(nav.points[i].ts_ms);
      expect(Number(dd.points[i].value)).toBeCloseTo((value-peak)/peak,12);
    }
  });
});
