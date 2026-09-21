// Exercises the actual dependency-free pagination owner, not a copy of it.
// Node 22.6+; run with --experimental-strip-types. Does not replace React tests.
import assert from 'node:assert/strict'
import test from 'node:test'
import { getNextObjectsContinuationToken } from '../frontend/src/pages/objects/objectsContinuation.ts'

const page = (overrides = {}) => ({
  bucket: 'bucket', prefix: '', delimiter: '/', items: [], commonPrefixes: [],
  isTruncated: true, nextContinuationToken: 's3v2.next', ...overrides,
})
const args = (overrides = {}) => ({
  lastPage: page(), lastPageParam: 's3v2.current', allPageParams: [undefined, 's3v2.current'],
  bucket: 'bucket', prefix: '', ...overrides,
})
test('empty filtered pages retain their continuation token', () => {
  assert.equal(getNextObjectsContinuationToken(args()), 's3v2.next')
})
test('nonempty pages retain their continuation token', () => {
  assert.equal(getNextObjectsContinuationToken(args({ lastPage: page({ items: [{ key: 'file', size: 1 }] }) })), 's3v2.next')
})
test('a final page stops even with a stray token', () => {
  assert.equal(getNextObjectsContinuationToken(args({ lastPage: page({ isTruncated: false }) })), undefined)
})
test('missing and empty continuation tokens stop', () => {
  for (const nextContinuationToken of [undefined, null, '']) {
    assert.equal(getNextObjectsContinuationToken(args({ lastPage: page({ nextContinuationToken }) })), undefined)
  }
})
test('immediate cursor cycles stop even on an empty page', () => {
  assert.equal(getNextObjectsContinuationToken(args({ lastPage: page({ nextContinuationToken: 's3v2.current' }) })), undefined)
})
test('earlier cursor cycles stop even on an empty page', () => {
  assert.equal(getNextObjectsContinuationToken(args({ allPageParams: [undefined, 's3v2.next', 's3v2.current'] })), undefined)
})
test('successive valid empty pages do not drop later objects', () => {
  const history = [undefined]
  let lastPageParam
  for (let i = 0; i < 20; i++) {
    const next = `s3v2.page-${i}`
    const got = getNextObjectsContinuationToken(args({ lastPage: page({ nextContinuationToken: next }), lastPageParam, allPageParams: history }))
    assert.equal(got, next)
    history.push(got)
    lastPageParam = got
  }
  assert.equal(getNextObjectsContinuationToken(args({ lastPage: page({ items: [{ key: 'last' }], isTruncated: false }), lastPageParam, allPageParams: history })), undefined)
})
