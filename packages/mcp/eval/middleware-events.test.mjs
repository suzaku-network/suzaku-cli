import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIDDLEWARE_NODE_EVENTS,
  GLOBAL_MIDDLEWARE_STAKE_EVENTS,
  middlewareNodeEventNames,
} from '../../../dist/middleware.js';

describe('middleware node-log compatibility', () => {
  it('keeps the established three middleware events as the default', () => {
    expect(middlewareNodeEventNames()).toEqual([...DEFAULT_MIDDLEWARE_NODE_EVENTS]);
    expect(middlewareNodeEventNames()).not.toEqual(expect.arrayContaining([...GLOBAL_MIDDLEWARE_STAKE_EVENTS]));
  });

  it('adds global stake events only when explicitly requested', () => {
    expect(middlewareNodeEventNames(true)).toEqual([
      ...DEFAULT_MIDDLEWARE_NODE_EVENTS,
      ...GLOBAL_MIDDLEWARE_STAKE_EVENTS,
    ]);
  });
});
