const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;
const MAX_ARRAY_LENGTH = 50;
const MAX_STRING_LENGTH = 4_096;

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'verificationtoken',
  'secret',
  'session',
  'sessionid',
  'csrf',
  'csrftoken',
  'credential',
  'credentials',
  'databaseurl',
  'redisurl',
  'email',
  'emailnormalized',
]);

function normalizedKey(key: string): string {
  return key.replace(/[-_\s]/g, '').toLowerCase();
}

function redactText(value: string): string {
  const truncated =
    value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;

  return truncated
    .replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b(redis(?:s)?|postgres(?:ql)?):\/\/[^\s/@:]+(?::[^\s/@]*)?@/gi,
      '$1://[REDACTED]@',
    );
}

export function redactForLogging(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol' || typeof value === 'function') {
    return String(value);
  }

  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message) };
  }

  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => redactForLogging(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(normalizedKey(key))
      ? REDACTED
      : redactForLogging(item, depth + 1, seen);
  }
  return result;
}
