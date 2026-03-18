import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationPreview } from './reply-checker.js';

describe('buildConversationPreview', () => {
  it('uses full body over snippet when body is available', () => {
    // A plain ASCII string whose base64 encoding avoids + and / characters.
    // "Hello world from Alice" encodes cleanly with standard btoa.
    const bodyText = 'Hello world from Alice. This is a longer body than Gmail would provide in the snippet field and it contains more useful information for the preview display.';
    // Simulate Gmail's base64url encoding: btoa then replace + with - and / with _
    const b64url = btoa(bodyText).replace(/\+/g, '-').replace(/\//g, '_');
    const snippet = bodyText.slice(0, 120); // Gmail-style truncation
    const msg = {
      labelIds: ['INBOX'],
      payload: {
        headers: [{ name: 'From', value: 'Alice <alice@example.com>' }],
        mimeType: 'text/plain',
        body: { data: b64url },
        parts: []
      },
      snippet
    };
    const thread = { messages: [msg] };
    const preview = buildConversationPreview(thread);
    assert.ok(preview.length > 120, `preview should exceed 120 chars, got: ${preview.length}`);
    assert.ok(preview.includes('Hello world from Alice'), 'preview should include body content');
  });

  it('falls back to snippet when body extraction yields nothing', () => {
    const msg = {
      labelIds: ['SENT'],
      payload: {
        headers: [{ name: 'From', value: 'Me <me@example.com>' }],
        parts: []
      },
      snippet: 'short snippet only'
    };
    const thread = { messages: [msg] };
    const preview = buildConversationPreview(thread);
    assert.ok(preview.includes('short snippet only'), 'preview should fall back to snippet');
  });
});
