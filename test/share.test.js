import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSetlist, decodeSetlist, setlistToText } from '../public/js/share.js';

test('el link del setlist lleva BPM y tonalidad', async () => {
    const setlist = { name: 'Boda', playlistUrl: '', songs: [{ title: 'Creep', artist: 'Radiohead', id: '', note: 'en G', bpm: 92, key: 'G' }, { title: 'La Bamba', artist: '', id: '', note: '' }] };
    const back = await decodeSetlist(await encodeSetlist(setlist));
    assert.equal(back.songs[0].bpm, 92);
    assert.equal(back.songs[0].key, 'G');
    assert.equal(back.songs[1].bpm, null);
    assert.equal(setlistToText(back), 'Boda\n\n1. Creep - Radiohead (en G) [G · 92 BPM]\n2. La Bamba');
});

test('los links viejos (sin BPM) siguen abriendo', async () => {
    const old = `j${Buffer.from(JSON.stringify({ n: 'v', p: '', s: [['T', 'A', '', 'Am']] })).toString('base64url')}`;
    const back = await decodeSetlist(old);
    assert.deepEqual(back.songs[0], { title: 'T', artist: 'A', id: '', note: 'Am', bpm: null, key: '' });
});
