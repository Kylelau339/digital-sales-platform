import { describe, expect, it } from 'vitest';

type Capture = { id: string; status: 'active' | 'superseded'; outcome: 'passed' | 'failed' | 'blocked' | 'timeout'; capturedAt: number };
function appendCapture(history: Capture[], capture: Capture, now: number): Capture[] {
  const recent = history.filter(item => now - item.capturedAt < 60_000);
  if (recent.length >= 3) throw new Error('PROOF_CAPTURE_RATE_LIMITED');
  return history.map(item => item.status === 'active' ? { ...item, status: 'superseded' as const } : item).concat({ ...capture, status: 'active' as const });
}

describe('M1 capture history contract', () => {
  it('limits the fourth attempt and counts failures', () => {
    let history: Capture[] = [];
    history = appendCapture(history, { id: '1', status: 'active', outcome: 'passed', capturedAt: 1 }, 1);
    history = appendCapture(history, { id: '2', status: 'active', outcome: 'failed', capturedAt: 2 }, 2);
    history = appendCapture(history, { id: '3', status: 'active', outcome: 'timeout', capturedAt: 3 }, 3);
    expect(() => appendCapture(history, { id: '4', status: 'active', outcome: 'blocked', capturedAt: 4 }, 4)).toThrow('PROOF_CAPTURE_RATE_LIMITED');
  });
  it('keeps one active record and retains prior outcomes as superseded', () => {
    let history: Capture[] = [];
    history = appendCapture(history, { id: '1', status: 'active', outcome: 'passed', capturedAt: 1 }, 1);
    history = appendCapture(history, { id: '2', status: 'active', outcome: 'failed', capturedAt: 61_001 }, 61_001);
    expect(history.filter(item => item.status === 'active').map(item => item.id)).toEqual(['2']);
    expect(history.find(item => item.id === '1')).toMatchObject({ status: 'superseded', outcome: 'passed' });
  });
});
