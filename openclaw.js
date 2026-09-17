import { get } from 'node:http';

const TIMEOUT_MS = 2000;
const MAX_RESPONSE_BYTES = 4096;

function validatePort(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Recorder port must be an integer from 1024 to 65535');
  }
  return port;
}

// Only availability is public. Never read credentials, events, or /status here.
export function readRecorderHealth(port = 9745, signal) {
  validatePort(port);
  return new Promise((resolve) => {
    let finished = false;
    let request;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      resolve(value);
      request?.destroy();
    };
    const unavailable = () => finish({ online: false, reason: 'unavailable_or_invalid_response' });
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const cancellation = signal ? AbortSignal.any([timeout, signal]) : timeout;
    request = get({
      hostname: '127.0.0.1', port, path: '/health',
      agent: false, signal: cancellation,
      headers: { Accept: 'application/json' },
    }, (response) => {
      // node:http does not follow redirects. All non-200 responses fail closed.
      if (response.statusCode !== 200 || !/^application\/json(?:;|$)/i.test(response.headers['content-type'] || '')) {
        unavailable();
        return;
      }
      let bytes = 0;
      const chunks = [];
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) { unavailable(); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (finished) return;
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (data?.online !== true || typeof data.version !== 'string' ||
              data.version.length > 32 || !/^\d+\.\d+\.\d+$/.test(data.version)) {
            unavailable();
            return;
          }
          // Select bounded fields; a local responder cannot inject arbitrary text.
          finish({ online: true, reportedVersion: data.version });
        } catch { unavailable(); }
      });
      response.on('error', unavailable);
      response.on('aborted', unavailable);
    });
    request.on('error', unavailable);
  });
}

export default {
  id: 'jep-guard-clawhub',
  name: 'JEP Guard for ClawHub',
  description: 'On-demand local recorder health check and browser companion setup.',
  version: '1.2.0',
  register(api) {
    const config = api.pluginConfig ?? {};
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        Object.keys(config).some((key) => key !== 'port')) {
      throw new Error('Only the recorder port can be configured');
    }
    const port = validatePort(config.port === undefined ? 9745 : config.port);
    api.registerTool({
      name: 'jep_guard_health',
      label: 'JEP recorder health',
      description: 'Check availability of the manually started local recorder. This does not authenticate the service, verify evidence, or authorize execution.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      async execute(_id, params, signal) {
        if (params !== undefined && (!params || typeof params !== 'object' ||
            Array.isArray(params) || Object.keys(params).length > 0)) {
          throw new Error('This health check accepts no arguments');
        }
        const health = await readRecorderHealth(port, signal);
        const details = { ...health, port, authenticated: false, enforcement: false };
        return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
      },
    }, { optional: true });
  },
};
