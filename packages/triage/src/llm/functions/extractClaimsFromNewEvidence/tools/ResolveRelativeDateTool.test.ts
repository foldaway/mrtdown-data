import { describe, expect, test } from 'vitest';
import { ResolveRelativeDateTool } from './ResolveRelativeDateTool.js';

describe('ResolveRelativeDateTool', () => {
  test('resolves saturday with weekOffset=1 into a day window', async () => {
    const tool = new ResolveRelativeDateTool();
    const output = await tool.runner({
      weekday: 'SA',
      weekOffset: 1,
      referenceTs: '2026-01-01T07:10:00+08:00',
      timeZone: 'Asia/Singapore',
    });
    const parsed = JSON.parse(output);

    expect(parsed).toMatchObject({
      resolved: true,
      granularity: 'day',
      startAt: '2026-01-10T00:00:00+08:00',
      endAt: '2026-01-11T00:00:00+08:00',
    });
  });

  test('resolves saturday with weekOffset=0 into a day window', async () => {
    const tool = new ResolveRelativeDateTool();
    const output = await tool.runner({
      weekday: 'SA',
      weekOffset: 0,
      referenceTs: '2013-04-17T10:00:00+08:00',
      timeZone: 'Asia/Singapore',
    });
    const parsed = JSON.parse(output);

    expect(parsed).toMatchObject({
      resolved: true,
      granularity: 'day',
      startAt: '2013-04-20T00:00:00+08:00',
      endAt: '2013-04-21T00:00:00+08:00',
    });
  });

  test('supports sunday with weekOffset=0', async () => {
    const tool = new ResolveRelativeDateTool();
    const output = await tool.runner({
      weekday: 'SU',
      weekOffset: 0,
      referenceTs: '2013-04-17T10:00:00+08:00',
      timeZone: 'Asia/Singapore',
    });
    const parsed = JSON.parse(output);

    expect(parsed).toMatchObject({
      resolved: true,
      granularity: 'day',
      startAt: '2013-04-21T00:00:00+08:00',
      endAt: '2013-04-22T00:00:00+08:00',
    });
  });
});
