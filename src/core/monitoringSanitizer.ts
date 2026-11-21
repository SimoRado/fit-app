type MonitoringEvent = {
  request?: unknown;
  user?: unknown;
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: unknown;
  message?: unknown;
  transaction?: unknown;
  exception?: { values?: { type?: string; value?: string }[] };
};

/** Remove request, identity, and exception details before a diagnostic leaves the device. */
export function sanitizeMonitoringEvent<T extends MonitoringEvent>(event: T): T {
  delete event.request;
  delete event.user;
  delete event.extra;
  delete event.contexts;
  delete event.breadcrumbs;
  event.message = undefined;
  event.transaction = undefined;
  for (const exception of event.exception?.values ?? []) {
    exception.value = `Fitapp ${exception.type ?? 'error'}`;
  }
  return event;
}
