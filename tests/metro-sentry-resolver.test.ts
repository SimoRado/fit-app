import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const metroConfig = require('../metro.config.js') as {
  resolver: {
    resolveRequest: (...args: unknown[]) => unknown;
  };
};
const resolveRequest = metroConfig.resolver.resolveRequest as unknown as (
  context: { originModulePath: string; resolveRequest: (_context: unknown, name: string) => unknown },
  moduleName: string,
  platform: string,
  oldMetroModuleName?: string,
) => unknown;

describe('Sentry Metro feedback exclusions', () => {
  it('stubs browser feedback wrappers when Metro supplies Windows paths', () => {
    const context = {
      originModulePath: 'C:\\Fit\\node_modules\\@sentry\\browser\\build\\npm\\esm\\prod\\index.js',
      resolveRequest: (_context: unknown, name: string) => ({ type: 'sourceFile', filePath: name }),
    };

    expect(resolveRequest(context, '.\\feedbackAsync.js', 'android')).toEqual({ type: 'empty' });
    expect(resolveRequest(context, '.\\feedbackSync.js', 'android')).toEqual({ type: 'empty' });
  });

  it('keeps unrelated Sentry browser modules on the normal resolver path', () => {
    const context = {
      originModulePath: 'C:\\Fit\\node_modules\\@sentry\\browser\\build\\npm\\esm\\prod\\index.js',
      resolveRequest: (_context: unknown, name: string) => ({ type: 'sourceFile', filePath: name }),
    };

    expect(resolveRequest(context, '.\\client.js', 'android')).toEqual({ type: 'sourceFile', filePath: '.\\client.js' });
  });
});
