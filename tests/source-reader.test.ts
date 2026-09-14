import assert from 'node:assert/strict';
import test from 'node:test';
import { blueBlood, type AuthoredWorld } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { choose, rewindSession, startSession } from '../src/game.ts';
import { findSourceMatches, sourceAnchorStatus, sourceParagraphs, sourceSegments, visibleSourcePassages } from '../src/source-reader.ts';

test('source search treats regex metacharacters as literal text', () => {
  const query = 'a.b[0](x)+?^$|{2}\\';
  const content = `before ${query}; aXb0xxx; ${query} after`;
  const matches = findSourceMatches(content, query);
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map(match => content.slice(match.start, match.end)), [query, query]);
  assert.equal(matches[0].start, 'before '.length);
  assert.equal(matches[1].end, content.length - ' after'.length);
});

test('source search trims the query, finds every case-insensitive match, and ignores blank input', () => {
  assert.deepEqual(findSourceMatches('Alpha alpha ALPHAbeta alph', ' alpha '), [
    { start: 0, end: 5 }, { start: 6, end: 11 }, { start: 12, end: 17 },
  ]);
  for (const query of ['', ' ', '\t\r\n']) assert.deepEqual(findSourceMatches('Alpha alpha', query), []);
  assert.deepEqual(findSourceMatches('Alpha alpha', 'missing'), []);
  assert.deepEqual(findSourceMatches('', 'alpha'), []);
});

test('Unicode search offsets use UTF-16 positions that can slice the original source', () => {
  const content = '甲\u{20bb7}乙\u{20bb7}甲';
  const query = '\u{20bb7}';
  const matches = findSourceMatches(content, query);
  assert.deepEqual(matches, [{ start: 1, end: 3 }, { start: 4, end: 6 }]);
  assert.deepEqual(matches.map(match => content.slice(match.start, match.end)), [query, query]);
  const paragraph = sourceParagraphs(content)[0];
  const segments = sourceSegments(paragraph, matches);
  assert.equal(segments.map(segment => segment.text).join(''), content);
  assert.deepEqual(segments.filter(segment => segment.matchIndex !== undefined).map(segment => segment.text), [query, query]);
});

test('paragraph trimming preserves original offsets across CRLF and blank lines', () => {
  const content = '\r\n  alpha \r\n\t\r\n\tbeta  \r\n  ';
  const paragraphs = sourceParagraphs(content);
  assert.deepEqual(paragraphs, [
    { text: 'alpha', start: 4, end: 9 },
    { text: 'beta', start: 16, end: 20 },
  ]);
  for (const paragraph of paragraphs) assert.equal(content.slice(paragraph.start, paragraph.end), paragraph.text);
  assert.deepEqual(sourceParagraphs('\u3000alpha\u3000\rbeta\n'), [
    { text: 'alpha', start: 1, end: 6 },
    { text: 'beta', start: 8, end: 12 },
  ]);
  assert.deepEqual(sourceParagraphs(' \r\n\t\n\u3000'), []);
  assert.deepEqual(sourceParagraphs(''), []);
});

test('highlight segments reconstruct each paragraph and retain global match indexes', () => {
  const content = 'Target other TARGET.\r\n  no match\r\nTarget';
  const paragraphs = sourceParagraphs(content);
  const matches = findSourceMatches(content, 'target');
  const segments = paragraphs.map(paragraph => sourceSegments(paragraph, matches));
  assert.deepEqual(segments, [
    [{ text: 'Target', matchIndex: 0 }, { text: ' other ' }, { text: 'TARGET', matchIndex: 1 }, { text: '.' }],
    [{ text: 'no match' }],
    [{ text: 'Target', matchIndex: 2 }],
  ]);
  assert.deepEqual(segments.map(parts => parts.map(part => part.text).join('')), paragraphs.map(paragraph => paragraph.text));
  assert.deepEqual(sourceSegments(paragraphs[0], []), [{ text: 'Target other TARGET.' }]);
});

test('a match spanning a line break highlights only the text within each paragraph', () => {
  const content = 'first bridge\r\nbridge last';
  const paragraphs = sourceParagraphs(content);
  const matches = findSourceMatches(content, 'bridge\r\nbridge');
  assert.equal(matches.length, 1);
  const segments = paragraphs.map(paragraph => sourceSegments(paragraph, matches));
  assert.deepEqual(segments, [
    [{ text: 'first ' }, { text: 'bridge', matchIndex: 0 }],
    [{ text: 'bridge', matchIndex: 0 }, { text: ' last' }],
  ]);
  assert.deepEqual(segments.map(parts => parts.map(part => part.text).join('')), paragraphs.map(paragraph => paragraph.text));
});

test('source anchors require an exact unique quotation', () => {
  const quote = 'Exact [source] passage.';
  assert.equal(sourceAnchorStatus(`Before ${quote} After`, quote), 'found');
  assert.equal(sourceAnchorStatus(`Before ${quote} After`, quote.toLowerCase()), 'missing');
  assert.equal(sourceAnchorStatus(`Before ${quote} After`, 'Absent passage.'), 'missing');
  assert.equal(sourceAnchorStatus(`${quote}\r\n${quote}`, quote), 'ambiguous');
  assert.equal(sourceAnchorStatus('', quote), 'missing');
});

test('empty or whitespace-only anchors cannot be reported as source evidence', () => {
  for (const quote of ['', ' ', '\r\n\t']) {
    assert.equal(sourceAnchorStatus(`Before${quote}After`, quote), 'missing');
    assert.equal(sourceAnchorStatus('', quote), 'missing');
  }
});

test('overlapping occurrences make a source anchor ambiguous', () => {
  assert.equal(sourceAnchorStatus('ababa', 'aba'), 'ambiguous');
  assert.equal(sourceAnchorStatus('aaa', 'aa'), 'ambiguous');
  assert.equal(sourceAnchorStatus('aba', 'aba'), 'found');
});

function passageFixture(): AuthoredWorld {
  return {
    ...blueBlood, version: 'source-reader-test', startNodeId: 'entry', resources: [], operationJournals: [],
    sourcePassages: [
      { id: 'entry-source', label: 'Entry', quote: 'The opening premise is available.', nodeIds: ['entry'], note: 'Fixture opening.' },
      { id: 'clue-source', label: 'Record', quote: 'A recorded fact can locate this.', nodeIds: ['future'], clues: ['recorded'], note: 'Fixture clue unlock.' },
      { id: 'decision-source', label: 'Decision', quote: 'A visited decision has this premise.', nodeIds: ['decision'], clues: ['recorded'], note: 'Fixture node or clue unlock.' },
      { id: 'future-source', label: 'Future', quote: 'A later scene has another premise.', nodeIds: ['future'], note: 'Fixture future scene.' },
      { id: 'ending-source', label: 'Ending', quote: 'The ending uses its own premise.', nodeIds: ['ending'], note: 'Fixture ending.' },
    ],
    nodes: {
      entry: { ...blueBlood.nodes.training, id: 'entry', text: ['Read the first record.'], choices: [
        { id: 'record', text: 'Record the fact', nextNodeId: 'decision', effects: { clues: ['recorded'] } },
        { id: 'skip', text: 'Leave the fact unrecorded', nextNodeId: 'decision' },
      ] },
      decision: { ...blueBlood.nodes.home, id: 'decision', text: ['Choose the next place.'], choices: [
        { id: 'inspect', text: 'Visit the later scene', nextNodeId: 'future' },
        { id: 'leave', text: 'Finish here', nextNodeId: 'ending' },
      ] },
      future: { ...blueBlood.nodes.home, id: 'future', text: ['The later scene is now visible.'], choices: [
        { id: 'finish', text: 'Finish the route', nextNodeId: 'ending' },
      ] },
      ending: { ...blueBlood.nodes.ending_witness, id: 'ending', text: ['The route has ended.'] },
    },
  };
}

test('visible source passages follow visited scenes and acquired clues without exposing future nodes', () => {
  let session = startSession(compileWorld(passageFixture()));
  assert.deepEqual(visibleSourcePassages(session).map(passage => passage.id), ['entry-source']);
  session = choose(session, session.choices[0]);
  assert.equal(session.node.id, 'decision');
  assert.ok(!session.history.some(entry => entry.nodeId === 'future'));
  assert.deepEqual(visibleSourcePassages(session).map(passage => passage.id), ['entry-source', 'clue-source', 'decision-source']);
  session = choose(session, session.choices[0]);
  assert.deepEqual(visibleSourcePassages(session).map(passage => passage.id), ['entry-source', 'clue-source', 'decision-source', 'future-source']);
  session = choose(session, session.choices[0]);
  const completed = visibleSourcePassages(session).map(passage => passage.id);
  assert.deepEqual(completed, ['entry-source', 'clue-source', 'decision-source', 'future-source', 'ending-source']);

  const decision = rewindSession(session, 1);
  assert.deepEqual(visibleSourcePassages(decision).map(passage => passage.id), ['entry-source', 'clue-source', 'decision-source']);
  const entry = rewindSession(session, 0);
  assert.deepEqual(visibleSourcePassages(entry).map(passage => passage.id), ['entry-source']);
  const alternate = choose(entry, entry.choices[1]);
  assert.deepEqual(alternate.clues, []);
  assert.deepEqual(visibleSourcePassages(alternate).map(passage => passage.id), ['entry-source', 'decision-source']);
  assert.deepEqual(visibleSourcePassages(session).map(passage => passage.id), completed);
});

test('worlds without source-passage metadata expose no anchors', () => {
  const session = startSession(compileWorld({ ...passageFixture(), sourcePassages: undefined }));
  assert.deepEqual(visibleSourcePassages(session), []);
});

test('compilation rejects source links with invalid references or unusable quotations', () => {
  const definition = passageFixture(), original = definition.sourcePassages![0];
  for (const patch of [
    { nodeIds: ['missing_scene'] }, { nodeIds: [] }, { clues: ['unearned_fact'] },
    { quote: '' }, { quote: 'short' }, { quote: 'a'.repeat(241) },
    { quote: 'A quotation across\ntwo paragraphs.' }, { label: ' ' }, { note: '' }, { id: 'bad id' },
  ]) assert.throws(() => compileWorld({ ...definition, sourcePassages: [{ ...original, ...patch }] }), /Invalid source passage/);
  assert.throws(() => compileWorld({ ...definition, sourcePassages: [original, original] }), /Invalid source passage/);
});
