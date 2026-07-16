import { describe, expect, test, vi } from 'vitest';
import { withConsoleLogRedirectedToStderr } from './consoleOutput.js';

describe('withConsoleLogRedirectedToStderr', () => {
  test('redirects nested stdout logs and restores console.log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await withConsoleLogRedirectedToStderr(async () => {
        console.log('replay trace');
      });
      console.log('json result');

      expect(error).toHaveBeenCalledWith('replay trace');
      expect(log).toHaveBeenCalledWith('json result');
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
