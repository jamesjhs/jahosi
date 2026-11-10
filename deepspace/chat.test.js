const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual client script with isolated browser storage and DOM events.
function openChat(storage = new Map(), options = {}) {
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.value = ''; this.textContent = ''; }
    append(...children) { children.forEach((child) => { child.parent = this; this.children.push(child); }); }
    get firstElementChild() { return this.children[0]; }
    get lastElementChild() { return this.children.at(-1); }
    cloneNode() { const copy = new Element(); copy.textContent = this.textContent; this.children.forEach((child) => copy.append(child.cloneNode())); return copy; }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute() {}
    focus() { this.listeners.focus?.(); }
    remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
    fire(name, event = {}) { return this.listeners[name]?.({ preventDefault() {}, ...event }); }
    getContext() { return null; }
  }
  const elements = Object.fromEntries(['message', 'send', 'thread', 'status', 'reset', 'export', 'gate', 'count', 'storage-note', 'chat-form', 'stars', 'motion'].map((id) => [id, new Element()]));
  const welcome = new Element(), body = new Element(); body.textContent = 'Welcome aboard.'; welcome.append(body); elements.thread.append(welcome);
  const requests = [], pdf = { lines: [], pages: 1 }, window = {
    DEEP_SPACE_SITE_KEY: options.key || '', location: { origin: 'https://example.test' },
    matchMedia: () => ({ matches: true, addEventListener() {} }), addEventListener() {},
    print() { pdf.printed = true; },
  };
  if (!options.noPdf) window.jspdf = { jsPDF: class {
    constructor() { this.internal = { pageSize: { getHeight: () => 297 } }; }
    setProperties() {} setFont() {} setFontSize() {}
    splitTextToSize(text) { return text.split('\n'); }
    text(line) { pdf.lines.push(line); }
    addPage() { pdf.pages++; }
    save(name) { pdf.name = name; }
  } };
  const context = vm.createContext({
    window, document: { getElementById: (id) => elements[id], createElement: () => new Element(), addEventListener() {} },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => { if (options.storageFails) throw new Error('Storage full'); storage.set(key, value); },
      removeItem: (key) => { if (options.storageFails) throw new Error('Storage blocked'); storage.delete(key); },
    },
    AbortSignal, requestAnimationFrame() {}, cancelAnimationFrame() {},
    fetch: async (_url, request) => {
      requests.push(JSON.parse(request.body));
      return { ok: !options.fetchFails, status: options.fetchFails ? 502 : 200, json: async () => ({ reply: 'We should seek understanding.\n'.repeat(60) }) };
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'public/chat.js'), 'utf8'), context);
  return { elements, requests, pdf, storage };
}

test('starter, word threshold, verification, draft persistence and failed submissions', async () => {
  const { elements: e, storage } = openChat();
  assert.equal(e.send.disabled, true);
  e.message.focus();
  assert.equal(e.message.value.trim(), 'Commander, we have encountered');
  assert.equal(e.send.disabled, true);
  e.message.value += 'visitors'; e.message.fire('input');
  assert.equal(e.send.disabled, false);
  assert.equal(openChat(storage).elements.message.value, e.message.value);
  e.message.value = 'one\n two\tthree    four'; e.message.fire('input');
  assert.equal(e.send.disabled, true);
  e.message.value += ' five'; e.message.fire('input');
  assert.equal(e.send.disabled, false);
  const gated = openChat(new Map(), { key: 'verification-required' }).elements;
  gated.message.value = 'one two three four five'; gated.message.fire('input');
  assert.equal(gated.send.disabled, true);
  const failed = openChat(new Map(), { fetchFails: true });
  failed.elements.message.value = 'one two three four five'; failed.elements.message.fire('input');
  await failed.elements['chat-form'].fire('submit');
  assert.equal(failed.elements.thread.children.length, 1);
  assert.equal(failed.elements.message.value, 'one two three four five');
});

test('full chat survives reopening, requests stay bounded, PDF paginates, and clear removes storage', async () => {
  const chat = openChat(), e = chat.elements;
  for (let i = 0; i < 6; i++) {
    e.message.value = `Commander we have encountered visitors ${i}`; e.message.fire('input');
    await e['chat-form'].fire('submit');
  }
  assert.equal(chat.requests.at(-1).history.length, 8);
  const restored = openChat(chat.storage);
  assert.equal(restored.elements.thread.children.length, 13);
  assert.equal(restored.elements.export.disabled, false);
  restored.elements.export.fire('click');
  assert.equal(restored.pdf.name, 'deepspace-chat-export.pdf');
  assert.ok(restored.pdf.pages > 1);
  assert.ok(restored.pdf.lines.includes('Commander we have encountered visitors 0'));
  restored.elements.reset.fire('click');
  assert.equal(chat.storage.size, 0);
  assert.equal(restored.elements.thread.children.length, 1);
  assert.equal(restored.elements.message.value, '');
  assert.equal(restored.elements.export.disabled, true);
  assert.equal(openChat(chat.storage).elements.thread.children.length, 1);
});

test('corrupt/blocked storage and unavailable PDF library leave chat usable', async () => {
  const corrupt = openChat(new Map([['deepspace-chat-v1', '{invalid']]));
  assert.equal(corrupt.elements.thread.children.length, 1);
  const chat = openChat(new Map(), { storageFails: true, noPdf: true });
  assert.match(chat.elements['storage-note'].textContent, /unavailable or full/);
  chat.elements.message.value = 'Commander we have encountered visitors'; chat.elements.message.fire('input');
  await chat.elements['chat-form'].fire('submit');
  chat.elements.export.fire('click');
  assert.equal(chat.pdf.printed, true);
});
