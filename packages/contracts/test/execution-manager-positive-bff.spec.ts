import { describe, it, expect } from 'vitest';
import { answerReviewManager } from '../../../apps/portal/fixture-bff/review-manager';
import { managerSeriesResponse } from '../../../apps/control-api/src/execution-v2/manager-series.contract';
import { scaled, setFixtureScale, setFixtureNow } from '../../../apps/portal/frontend/e2e/bffScale';
function read(metric: string, profile: 'populated' | 'layout-stress' = 'populated', workspace?: string) {
  const query = new URLSearchParams({environment:'paper', metric, window:JSON.stringify('30D'), subjects:JSON.stringify([{subject_type:'PORTFOLIO',subject_id:'TEST_ONLY:portfolio-a'}])});
  if(workspace) query.set('workspace_id', workspace);
  const response=answerReviewManager('GET','/manager/series',query,profile);
  expect(response?.status).toBe(200);
  return response!.body as any;
}
describe('populated BFF positive series',()=>{
  it('links Fleet rows to the same alpha/deployment/account facts without index-based missing values',()=>{
    setFixtureScale('medium'); setFixtureNow('2026-10-22T12:00:00Z');
    try {
      const response=answerReviewManager('GET','/manager/fleet',new URLSearchParams({environment:'paper',limit:'200'}),'populated');
      expect(response?.status).toBe(200);
      const rows=(response!.body as any).items;
      expect(rows.length).toBeGreaterThan(0);
      for(const row of rows) {
        const alpha=scaled().alphas.find(a=>a.id===row.alpha_id)!;
        expect(alpha).toBeDefined();
        const members=row.children.map((child:any)=> {
          const d=alpha.deployments.find(d=>d.id===child.deployment_id)!;
          expect(d).toBeDefined();
          expect(child.account_id).toBe(d.accountId);
          expect(child.portfolio_id).toBe(d.portfolioId);
          return d;
        });
        expect(Number(row.metrics.net_pnl.value)).toBeCloseTo(members.reduce((n:number,d:any)=>n+Number(d.realized),0),8);
        expect(row.metrics.unrealized_pnl.availability).toBe('AVAILABLE');
      }
      for(const portfolioId of new Set<string>(rows.map((r:any)=>r.portfolio_id))) {
        const detail=answerReviewManager('GET',`/manager/portfolios/${portfolioId}/overview`,new URLSearchParams({environment:'paper',limit:'200',window:JSON.stringify('30D')}),'populated');
        expect(detail?.status).toBe(200);
        const book=detail!.body as any;
        const series=answerReviewManager('GET','/manager/series',new URLSearchParams({environment:'paper',metric:'NAV',window:JSON.stringify('30D'),subjects:JSON.stringify([{subject_type:'PORTFOLIO',subject_id:portfolioId}])}),'populated')!;
        expect(series.status).toBe(200);
        const entry=(series.body as any).series[0];
        expect(managerSeriesResponse.safeParse(series.body).success).toBe(true);
        const statement=book.capital_statements.find((s:any)=>s.partition.currency===entry.partition.currency);
        expect(Number(entry.points.at(-1).value)).toBe(Number(statement.metrics.current_nav.value));
      }
    } finally { setFixtureScale('small'); }
  });
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
