// Unit tests for the pure helpers in static/js/shared.js. Run: node --test tests/js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../static/js/shared.js', import.meta.url), 'utf8');

// shared.js is a browser script: it needs t() and I18N at load time (labels), nothing else
function load({ english = false } = {}) {
    const context = vm.createContext({
        Intl,
        t: text => text,
        I18N: { locale: english ? 'en-GB' : 'nb-NO', isEnglish: english, href: path => path },
    });
    vm.runInContext(source, context, { filename: 'shared.js' });
    return context;
}

const js = load();
const NBSP = ' ';
const SQUARE = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
const HOLE = [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7], [0.3, 0.3]];

test('escapeHtml escapes markup and quotes', () => {
    assert.equal(js.escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    assert.equal(js.escapeHtml(null), '');
    assert.equal(js.escapeHtml(undefined), '');
    assert.equal(js.escapeHtml(5), '5');
});

test('safeUrl keeps web, mail and phone links, rejects scripts', () => {
    assert.equal(js.safeUrl('https://example.org/a'), 'https://example.org/a');
    assert.equal(js.safeUrl('mailto:post@example.org'), 'mailto:post@example.org');
    assert.equal(js.safeUrl('tel:+4712345678'), 'tel:+4712345678');
    assert.equal(js.safeUrl('skoler/oslo/x'), 'skoler/oslo/x');
    assert.equal(js.safeUrl('javascript:alert(1)'), '#');
    assert.equal(js.safeUrl('JavaScript:alert(1)'), '#');
    assert.equal(js.safeUrl(' java\tscript:alert(1)'), '#');
    assert.equal(js.safeUrl('data:text/html,<b>x</b>'), '#');
    assert.equal(js.safeUrl(null), '');
});

test('formatDecimal and formatPercent in Norwegian', () => {
    assert.equal(js.formatDecimal(11.34), '11,3');
    assert.equal(js.formatDecimal(2), '2,0');
    assert.equal(js.formatPercent(11.34), '11,3&nbsp;%');
});

test('formatPercent in English', () => {
    assert.equal(load({ english: true }).formatPercent(11.34), '11.3%');
});

test('formatDistance', () => {
    assert.equal(js.formatDistance(846), '850 m');
    assert.equal(js.formatDistance(1234), '1,2 km');
    assert.ok(!js.formatDistance(1234).includes(NBSP));
});

test('schoolKey and schoolUrl', () => {
    const school = { name: 'Bjølsen skole', kommune: 'Oslo', schoolType: 'barneskole' };
    assert.equal(js.schoolKey(school), 'Bjølsen skole|Oslo|barneskole');
    assert.equal(js.schoolUrl(school), 'skole?id=Bj%C3%B8lsen%20skole%7COslo%7Cbarneskole');
    assert.equal(js.schoolUrl({ ...school, page: 'skoler/oslo/bjolsen-skole' }), 'skoler/oslo/bjolsen-skole');
});

test('insideRings agrees with skolekretser._inside on the same fixtures', () => {
    // Same cases as tests/test_skolekretser.py InsideTest
    assert.equal(js.insideRings(0.5, 0.1, [SQUARE]), true);
    assert.equal(js.insideRings(1.5, 0.5, [SQUARE]), false);
    assert.equal(js.insideRings(0.5, -0.1, [SQUARE]), false);
    assert.equal(js.insideRings(0.5, 0.5, [SQUARE, HOLE]), false);
    assert.equal(js.insideRings(0.1, 0.5, [SQUARE, HOLE]), true);
    assert.equal(js.insideRings(0.5, 0.5, [SQUARE.slice(0, -1)]), true);
});

test('baseMapStyle gives missing numbers a fallback', () => {
    const style = {
        layers: [
            { id: 'label', filter: ['all', ['>=', ['get', 'rank'], 20], ['==', 'class', 'city']] },
            { id: 'shield', filter: ['<=', ['get', 'ref_length'], 6] },
            { id: 'reversed', filter: ['<', 3, ['get', 'rank']] },
            { id: 'building', paint: { 'fill-extrusion-height': ['get', 'render_height'],
                                       'fill-extrusion-base': ['get', 'render_min_height'] } },
            { id: 'plain', paint: { 'fill-extrusion-height': 10 } },
        ],
    };
    const out = js.baseMapStyle(style);
    const [label, shield, reversed, building, plain] = out.layers.map(l => JSON.parse(JSON.stringify(l)));
    assert.deepEqual(label.filter, ['all', ['>=', ['coalesce', ['get', 'rank'], -1e9], 20], ['==', 'class', 'city']]);
    assert.deepEqual(shield.filter, ['<=', ['coalesce', ['get', 'ref_length'], 1e9], 6]);
    // 3 < rank: a missing rank must make it false, so the fallback is low
    assert.deepEqual(reversed.filter, ['<', 3, ['coalesce', ['get', 'rank'], -1e9]]);
    assert.deepEqual(building.paint['fill-extrusion-height'], ['coalesce', ['get', 'render_height'], 0]);
    assert.deepEqual(building.paint['fill-extrusion-base'], ['coalesce', ['get', 'render_min_height'], 0]);
    assert.equal(plain.paint['fill-extrusion-height'], 10);
});

test('walkEstimate: 1 km straight line is 1.3 km and 17 minutes', () => {
    const from = { lat: 59.9, lng: 10.75 };
    const to = { lat: 59.9 + 1 / 111.195, lng: 10.75 };   // 1 km north
    const walk = js.walkEstimate(from, to);
    assert.ok(Math.abs(walk.air - 1) < 0.001);
    assert.ok(Math.abs(walk.road - 1.3) < 0.002);
    assert.equal(walk.minutes, 17);
    assert.equal(js.walkEstimate(from, from).minutes, 1);
});

test('titleCase and escapeRegex', () => {
    assert.equal(js.titleCase('ØVRE SLOTTSGATE 2-NORD'), 'Øvre Slottsgate 2-Nord');
    assert.equal(js.escapeRegex('a.b*(c)'), 'a\\.b\\*\\(c\\)');
});

test('middleOf a square is its centre', () => {
    const middle = js.middleOf([[SQUARE]]);
    assert.ok(Math.abs(middle.lng - 0.5) < 1e-12 && Math.abs(middle.lat - 0.5) < 1e-12);
});
