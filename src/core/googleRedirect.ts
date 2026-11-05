type RedirectOptions = { native: string; scheme: string; path: string };

export function googleRedirect(scheme: unknown, makeRedirectUri: (options: RedirectOptions) => string) {
  if (typeof scheme !== 'string' || !/^[a-z][a-z0-9+.-]*$/i.test(scheme)) {
    throw new Error('OAuth redirect configuration is unavailable');
  }
  const url = `${scheme}://oauth-callback`;
  const generatedMatches = makeRedirectUri({ native: url, scheme, path: 'oauth-callback' }) === url;
  return { url, generatedMatches };
}
