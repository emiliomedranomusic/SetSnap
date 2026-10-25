import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryKV, mockFetch, req } from './helpers.js';
import { findVideos, watchUrls, videoIdFromUrl, cacheKey } from '../lib/server/youtube.js';
import { onRequestPost as youtube } from '../functions/api/youtube.js';

const SP = (n) => String(n).padStart(22, 'b');
const VID = (n) => `vid${String(n).padStart(8, '0')}`;

test('videoIdFromUrl', () => {
    assert.equal(videoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(videoIdFromUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=x'), 'dQw4w9WgXcQ');
    assert.equal(videoIdFromUrl('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(videoIdFromUrl('nada'), null);
});

test('watchUrls parte en listas de 50', () => {
    const urls = watchUrls([...Array.from({ length: 60 }, (_, i) => VID(i)), null]);
    assert.equal(urls.length, 2);
    assert.match(urls[0], /^https:\/\/www\.youtube\.com\/watch_videos\?video_ids=/);
    assert.equal(urls[0].split('=')[1].split(',').length, 50);
});

test('cada canción se busca una vez: la segunda vez sale de caché', async () => {
    const env = { YOUTUBE_API_KEY: 'k', SETSNAP_KV: memoryKV() };
    let n = 0;
    const m = mockFetch([['https://www.googleapis.com/youtube/v3/search', () => Response.json({ items: [{ id: { videoId: VID(++n) } }] })]]);
    try {
        const songs = [{ id: SP(1), title: 'Creep', artist: 'Radiohead' }, { id: '', title: 'La Bamba', artist: '' }];
        const first = await findVideos(env, songs);
        assert.deepEqual(first.videos, [VID(1), VID(2)]);
        assert.equal(m.calls.length, 2);
        const again = await findVideos(env, songs);
        assert.deepEqual(again.videos, [VID(1), VID(2)]);
        assert.equal(m.calls.length, 2, 'no volvió a gastar búsquedas');
        assert.equal(env.SETSNAP_KV.map.get(`yt:searches:${new Date().toISOString().slice(0, 10)}`), '2');
        assert.ok(env.SETSNAP_KV.map.has(cacheKey(songs[0])));
    } finally {
        m.restore();
    }
});

test('respeta el tope diario de búsquedas', async () => {
    const env = { YOUTUBE_API_KEY: 'k', YOUTUBE_DAILY_SEARCHES: '1', SETSNAP_KV: memoryKV() };
    const m = mockFetch([['https://www.googleapis.com/youtube/v3/search', () => Response.json({ items: [{ id: { videoId: VID(1) } }] })]]);
    try {
        const res = await findVideos(env, [{ id: SP(1), title: 'A' }, { id: SP(2), title: 'B' }]);
        assert.deepEqual(res.videos, [VID(1), null]);
        assert.equal(res.limited, true);
        assert.equal(m.calls.length, 1);
    } finally {
        m.restore();
    }
});

test('cuota de YouTube agotada (403) no rompe: marca limited', async () => {
    const env = { YOUTUBE_API_KEY: 'k', SETSNAP_KV: memoryKV() };
    const m = mockFetch([['https://www.googleapis.com/youtube/v3/search', () => Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 })]]);
    try {
        const res = await findVideos(env, [{ id: SP(1), title: 'A' }, { id: SP(2), title: 'B' }]);
        assert.deepEqual(res.videos, [null, null]);
        assert.equal(res.limited, true);
        assert.equal(m.calls.length, 1, 'no insiste tras agotar la cuota');
    } finally {
        m.restore();
    }
});

test('con llave de Odesli no gasta cuota de YouTube', async () => {
    const env = { YOUTUBE_API_KEY: 'k', ODESLI_API_KEY: 'o', SETSNAP_KV: memoryKV() };
    const m = mockFetch([
        ['https://api.song.link/', (url) => {
            assert.equal(new URL(url).searchParams.get('key'), 'o');
            return Response.json({ linksByPlatform: { youtubeMusic: { url: `https://music.youtube.com/watch?v=${VID(7)}` } } });
        }],
    ]);
    try {
        const res = await findVideos(env, [{ id: SP(1), title: 'Creep', artist: 'Radiohead' }]);
        assert.deepEqual(res.videos, [VID(7)]);
        assert.ok(!m.calls.some((c) => c.url.includes('googleapis')));
    } finally {
        m.restore();
    }
});

test('endpoint /api/youtube', async () => {
    const env = { YOUTUBE_API_KEY: 'k', SETSNAP_KV: memoryKV() };
    const m = mockFetch([['https://www.googleapis.com/youtube/v3/search', () => Response.json({ items: [{ id: { videoId: VID(3) } }] })]]);
    try {
        const res = await youtube({ request: req('https://x/api/youtube', { method: 'POST', body: { songs: [{ id: SP(1), title: 'Creep', artist: 'Radiohead' }] } }), env });
        const data = await res.json();
        assert.equal(res.status, 200);
        assert.deepEqual(data.urls, [`https://www.youtube.com/watch_videos?video_ids=${VID(3)}`]);
        const off = await youtube({ request: req('https://x/api/youtube', { method: 'POST', body: { songs: [] } }), env: { SETSNAP_KV: memoryKV() } });
        assert.equal(off.status, 503);
    } finally {
        m.restore();
    }
});
