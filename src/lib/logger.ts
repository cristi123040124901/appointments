// src/lib/logger.ts
//
// Nu avem un serviciu extern (Sentry etc.) configurat — asta e o formă
// minimă de logging structurat peste console.error/warn, ca liniile să
// fie ușor de filtrat/agregat (ex. `journalctl | jq`) dacă se adaugă
// vreodată un colector de loguri, fără să introducem o dependință nouă acum.
type LogContext = Record<string, unknown>;

function serialize(
  level: "error" | "warn",
  scope: string,
  message: string,
  context?: LogContext,
): string {
  return JSON.stringify({
    level,
    scope,
    message,
    ...context,
    timestamp: new Date().toISOString(),
  });
}

export const logger = {
  error(scope: string, error: unknown, context?: LogContext) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(serialize("error", scope, message, { ...context, stack }));
  },
  warn(scope: string, message: string, context?: LogContext) {
    console.warn(serialize("warn", scope, message, context));
  },
};
