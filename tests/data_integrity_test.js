const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const context = { console, Date, Math, JSON, Map, Set, Array, Object, String, Number, Boolean, RegExp, Promise, URL, crypto: { randomUUID: () => 'test' } };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ['assets/js/00-env.js', 'assets/js/01-utils-basic.js', 'assets/js/03-domain-defaults.js', 'assets/js/11-word-data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const books = vm.runInContext('BOOKS.map((book) => ({ ...book }))', context);
assert.strictEqual(books.length, 3, 'unexpected book count');
for (const book of books) {
  const text = fs.readFileSync(path.join(root, book.csv), 'utf8');
  context.__csvText = text;
  const words = vm.runInContext('mapWords(parseCsv(__csvText))', context);
  assert(words.length > 0, `${book.csv} has no valid words`);
  assert.strictEqual(new Set(words.map((word) => word.id)).size, words.length, `${book.csv} has duplicate ids`);
  assert(words.every((word) => word.unit >= 1 && word.unit <= book.totalUnits), `${book.csv} has out-of-range units`);
  assert(words.every((word) => word.en && Number.isFinite(word.id)), `${book.csv} has invalid word rows`);
}
console.log('CSV data integrity tests passed');
