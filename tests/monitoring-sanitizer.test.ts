import { describe, expect, it } from 'vitest';
import { sanitizeMonitoringEvent } from '../src/core/monitoringSanitizer';

describe('monitoring event sanitization', () => {
  it('removes synthetic credentials and fitness data before reporting', () => {
    const sensitive = 'synthetic-secret-token-and-private-workout-note';
    const event = sanitizeMonitoringEvent({
      request: { headers: { Authorization: `Bearer ${sensitive}` }, url: `https://example.test/?token=${sensitive}` },
      user: { id: 'user_synthetic', email: 'synthetic@example.test' },
      extra: { birthDate: '1990-01-01', weight: 73.4, note: sensitive },
      contexts: { workout: { note: sensitive } },
      breadcrumbs: [{ data: { nutrition: sensitive } }],
      message: sensitive,
      transaction: sensitive,
      exception: { values: [{ type: 'Error', value: sensitive }] },
    });

    expect(event.request).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.contexts).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.message).toBeUndefined();
    expect(event.transaction).toBeUndefined();
    expect(event.exception?.values?.[0]?.value).toBe('Fitapp Error');
    expect(JSON.stringify(event)).not.toContain(sensitive);
  });
});
