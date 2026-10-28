// The setup page opens on a new install only: not on an update, nor when
// the browser itself updates, nor for a copy loaded for a moment (Firefox's
// temporary add-on), which is a developer's.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { opensSetup } from './welcome.ts';

test('the setup page opens on a new install, and on nothing else', () => {
    assert.equal(opensSetup({ reason: 'install' }), true);
    assert.equal(opensSetup({ reason: 'install', temporary: false }), true);
    assert.equal(opensSetup({ reason: 'install', temporary: true }), false);
    assert.equal(opensSetup({ reason: 'update', previousVersion: '0.2.0' }), false);
    assert.equal(opensSetup({ reason: 'chrome_update' }), false);
    assert.equal(opensSetup({ reason: 'shared_module_update' }), false);
});
