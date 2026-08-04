const assert = require('node:assert/strict');
const test = require('node:test');

const { createNetlifyHandler } = require('../server/netlify-handler.cjs');

test('connects the Netlify Blobs context before handling a function invocation', async () => {
  const event = { blobs: 'encoded-context' };
  const calls = [];
  const handler = createNetlifyHandler({
    connectLambda(receivedEvent) {
      calls.push(['connect', receivedEvent]);
    },
    appHandler: async (receivedEvent, context) => {
      calls.push(['handle', receivedEvent, context]);
      return { statusCode: 200 };
    }
  });

  const context = { requestId: 'request-1' };
  const response = await handler(event, context);

  assert.deepEqual(response, { statusCode: 200 });
  assert.deepEqual(calls, [
    ['connect', event],
    ['handle', event, context]
  ]);
});
