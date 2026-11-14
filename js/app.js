// Ink Sandbox — wiring: pointer tools, the frame loop, history, controls, language.

import * as Ink from './ink.js';
import { traceContours, toPathData } from './contour.js';
import * as Press from './press.js';
import { STRINGS, initialLang, saveLang, applyLang } from './i18n.js';

const VERSION = '5.0.0';
const MAX_HISTORY = 50;
const SPEC_ISO = 2.6; // where the field is this dense, the ink pools deep enough to reflect

const $ = (id) => document.getElementById(id);
const canvas = $('press');
const body = document.body;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const narrow = matchMedia('(max-width: 720px)');

const ink = Ink.createInk();
const press = Press.createPress(canvas);

const state = {
  tool: 'drop',
  size: 34,
  paused: false,
  guides: false,
  lang: initialLang(),
  intro: true,
  path: null,
  colors: {},
};

const pointer = { x: -999, y: -999, px: 0, py: 0, down: false, inside: false, touch: false, hold: 0, bubble: null };
const history = [];

// ---------- language ----------

const t = (key) => STRINGS[state.lang][key];

function setLang(lang) {
  state.lang = lang;
  saveLang(lang);
  applyLang(lang);
  document.querySelector('meta[name="description"]').setAttribute('content', t('doc.description'));
  document.querySelectorAll('.lang-opt').forEach((el) => el.classList.toggle('is-on', el.dataset.lang === lang));
  $('freezeLabel').textContent = t(state.paused ? 'resume' : 'freeze');
  $('inviteText').textContent = inviteCopy();
  lastCount = '';
  syncCount();
  buildPalettes();
}

function countCopy() {
  const b = ink.bubbles.length;
  const drops = `${n2s(ink.drops.length)} ${t(ink.drops.length === 1 ? 'drop' : 'drops')}`;
  return b ? `${drops}, ${n2s(b)} ${t(b === 1 ? 'bubble' : 'bubbles')}` : drops;
}

const n2s = (n) => n.toLocaleString(state.lang);

const inviteCopy = () => (ink.drops.length === 0 && !state.intro ? t('empty') : t(pointer.touch ? 'invite.touch' : 'invite'));

// ---------- history ----------

function snapshot() {
  history.push({ drops: ink.drops.map((d) => d.clone()), bubbles: ink.bubbles.map((b) => b.clone()) });
  if (history.length > MAX_HISTORY) history.shift();
  syncUndo();
}

function undo() {
  const last = history.pop();
  if (!last) return;
  ink.drops = last.drops;
  ink.bubbles = last.bubbles;
  pointer.bubble = null;
  syncUndo();
  syncCount();
}

function syncUndo() {
  $('btnUndo').disabled = history.length === 0;
  $('undoCount').textContent = history.length ? String(history.length) : '';
}

// ---------- status ----------

let lastCount = '';
function syncCount() {
  const n = ink.drops.length;
  const key = `${n}/${ink.bubbles.length}/${state.intro}`;
  if (key === lastCount) return;
  lastCount = key;
  $('counter').textContent = countCopy();
  body.classList.toggle('is-empty', n === 0 && !state.intro);
  $('invite').classList.toggle('is-hidden', !(state.intro || n === 0));
  $('inviteText').textContent = inviteCopy();
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
}

// ---------- intro + panel ----------

function endIntro() {
  if (!state.intro) return;
  state.intro = false;
  body.classList.remove('is-intro');
  syncCount();
}

function setPanel(open) {
  body.classList.toggle('panel-open', open);
  $('panelToggle').setAttribute('aria-expanded', String(open));
}

// ---------- actions ----------

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll('.tool[data-tool]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tool === tool)));
}

function setSize(v) {
  state.size = Math.max(12, Math.min(85, Math.round(v)));
  $('size').value = state.size;
  $('size-out').textContent = `${state.size} px`;
  fillTrack($('size'));
}

function toggleFreeze() {
  state.paused = !state.paused;
  $('btnFreeze').setAttribute('aria-pressed', String(state.paused));
  $('btnFreeze').querySelector('use').setAttribute('href', state.paused ? '#i-play' : '#i-pause');
  $('freezeLabel').textContent = t(state.paused ? 'resume' : 'freeze');
  $('frozenTag').hidden = !state.paused;
}

function toggleGuides() {
  state.guides = !state.guides;
  $('btnGuides').setAttribute('aria-pressed', String(state.guides));
}

function clearPaper() {
  if (ink.drops.length) snapshot();
  ink.drops = [];
  ink.bubbles = [];
  endIntro();
  syncCount();
}

function loadSample() {
  if (ink.drops.length) snapshot();
  Ink.sampleCluster(ink, press.width, press.height);
  syncCount();
}

function mutate() {
  snapshot();
  if (!ink.drops.length) Ink.sampleCluster(ink, press.width, press.height);
  else Ink.mutate(ink, press.width, press.height);
  if (state.paused) {
    ink.time += 0.35;
    Ink.step(ink);
  }
  syncCount();
}

function meta() {
  return {
    app: 'Ink Sandbox',
    version: VERSION,
    author: 'Agustín Amato',
    created: new Date().toISOString(),
    drops: ink.drops.length,
    bubbles: ink.bubbles.length,
    ink: { ...ink.params, color: press.settings.ink, gloss: press.settings.gloss },
  };
}

function exportSVG() {
  if (!state.path) return toast(t('nothing'));
  Press.exportSVG(press, state.path, meta());
  toast(t('exported'));
}

function exportPNG() {
  if (!state.path) return toast(t('nothing'));
  render(false);
  Press.exportPNG(press);
  toast(t('exported.png'));
}

// ---------- ink and ground ----------

function readColors() {
  const css = getComputedStyle(body);
  state.colors = {
    line: css.getPropertyValue('--text').trim(),
    accent: css.getPropertyValue('--accent-ink').trim(),
    danger: css.getPropertyValue('--danger').trim(),
  };
}

function setInk(ink, ground) {
  press.settings.ink = ink;
  if (ground) press.settings.ground = ground;
  const light = relativeLuminance(press.settings.ground) > 0.5;
  const root = document.documentElement.style;
  root.setProperty('--ground', press.settings.ground);
  root.setProperty('--ink', ink);
  body.classList.toggle('on-light', light);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', press.settings.ground);
  $('inkPicker').value = ink;
  $('inkHex').textContent = ink.toUpperCase();
  readColors();
}

function relativeLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function buildPalettes() {
  const group = $('palettes');
  group.replaceChildren(
    ...Press.PALETTES.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(press.settings.ink === p.ink && press.settings.ground === p.ground));
      b.setAttribute('aria-label', t(`palette.${p.id}`));
      b.title = t(`palette.${p.id}`);
      b.style.setProperty('--c', p.ink);
      b.style.setProperty('--g', p.ground);
      b.addEventListener('click', () => {
        setInk(p.ink, p.ground);
        group.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', String(s === b)));
      });
      return b;
    })
  );
  // Arrow keys move between swatches like a native radio group.
  group.onkeydown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const items = [...group.children];
    const i = items.indexOf(document.activeElement);
    const next = items[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length];
    next.focus();
    next.click();
  };
}

// The slider track is filled in the accent up to the knob, as on iOS.
function fillTrack(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', `${p}%`);
}

function bindRange(id, format, apply) {
  const input = $(id);
  const out = $(`${id}-out`);
  const update = () => {
    const v = Number(input.value);
    out.textContent = format(v);
    fillTrack(input);
    apply(v);
  };
  input.addEventListener('input', update);
  update();
}

// ---------- pointer ----------

function localPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

let airHintShown = false;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const p = localPoint(e);
  pointer.touch = e.pointerType !== 'mouse';
  canvas.classList.toggle('is-touch', pointer.touch);
  canvas.setPointerCapture(e.pointerId);
  Object.assign(pointer, p, { px: p.x, py: p.y, down: true, inside: true, hold: 0, bubble: null });

  endIntro();
  if (narrow.matches) setPanel(false);
  snapshot();

  if (state.tool === 'drop') {
    if (ink.drops.length >= Ink.MAX_DROPS) toast(t('full'));
    Ink.dropAt(ink, p.x, p.y, state.size);
  } else if (state.tool === 'air') {
    pointer.bubble = Ink.blow(ink, p.x, p.y, state.size);
    if (!pointer.bubble && !airHintShown) {
      airHintShown = true;
      toast(t('air.hint'));
    }
  } else if (state.tool === 'erase') {
    Ink.erase(ink, p.x, p.y, state.size);
  }
  syncCount();
});

canvas.addEventListener('pointermove', (e) => {
  const p = localPoint(e);
  pointer.x = p.x;
  pointer.y = p.y;
  pointer.inside = true;
  pointer.touch = e.pointerType !== 'mouse';
});

const release = () => {
  pointer.down = false;
  pointer.bubble = null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { if (!pointer.down) pointer.inside = false; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  setSize(state.size + (e.deltaY > 0 ? -3 : 3));
}, { passive: false });

function continuousTool() {
  if (!pointer.down) return;
  pointer.hold++;
  const { x, y, px, py } = pointer;
  if (state.tool === 'drop') Ink.dropperDrag(ink, x, y, px, py, state.size, pointer.hold);
  else if (state.tool === 'air') pointer.bubble = Ink.airDrag(ink, x, y, px, py, state.size, pointer.bubble);
  else if (state.tool === 'stir') Ink.stir(ink, x, y, x - px, y - py, state.size);
  else Ink.erase(ink, x, y, state.size);
  syncCount();
}

// ---------- keyboard ----------

const TOOL_KEYS = { 1: 'drop', 2: 'air', 3: 'stir', 4: 'erase' };

window.addEventListener('keydown', (e) => {
  const inField = e.target.closest?.('input:not([type="range"]), textarea, select, [contenteditable]');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (inField) return;
    e.preventDefault();
    undo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || inField || e.target.type === 'range') return;
  const onButton = e.target.closest?.('button, a');
  const key = e.key.toLowerCase();

  if (TOOL_KEYS[key]) return setTool(TOOL_KEYS[key]);
  switch (key) {
    case ' ':
      if (onButton) return;
      e.preventDefault();
      toggleFreeze();
      break;
    case 'z': undo(); break;
    case 'r': mutate(); break;
    case 'g': toggleGuides(); break;
    case 'c': clearPaper(); break;
    case 's': exportSVG(); break;
    case 'escape': if (body.classList.contains('panel-open')) setPanel(false); break;
  }
});

// ---------- frame loop ----------

function render(overlays = true) {
  Ink.computeField(ink);
  state.path = ink.drops.length ? toPathData(traceContours(ink, 1)) || null : null;
  const spec = state.path && press.settings.gloss > 0.01 ? toPathData(traceContours(ink, SPEC_ISO)) || null : null;
  Press.print(press, state.path, spec);

  if (!overlays) return;
  if (state.guides) Press.drawGuides(press, ink, state.colors.line, state.colors.accent);
  if (pointer.inside && !pointer.touch) Press.drawCursor(press, state.tool, pointer.x, pointer.y, state.size, state.colors);
}

let frameNo = 0;
function frame() {
  continuousTool();
  pointer.px = pointer.x;
  pointer.py = pointer.y;

  if (state.paused) Ink.applyBloat(ink);
  else Ink.step(ink, reducedMotion.matches ? 0 : 1);
  if (++frameNo % 15 === 0) {
    Ink.popStrayBubbles(ink);
    syncCount();
  }

  render();
  requestAnimationFrame(frame);
}

function resize() {
  Press.resizePress(press, window.innerWidth, window.innerHeight);
  Ink.resizeField(ink, press.width, press.height);
}

// ---------- boot ----------

// Profile and source links. On GitHub Pages (<user>.github.io/<repo>/) they are
// read from the address, so a fork links to itself.
function linkRepo() {
  let user = 'amatosaurio22';
  let repo = 'ink-sandbox';
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (m) {
    user = m[1];
    repo = location.pathname.split('/').filter(Boolean)[0] || `${user}.github.io`;
  }
  document.querySelectorAll('.author-link').forEach((a) => { a.href = `https://github.com/${user}`; });
  document.querySelectorAll('.source-link').forEach((a) => { a.href = `https://github.com/${user}/${repo}`; });
  document.querySelectorAll('.source-wrap').forEach((el) => { el.hidden = false; });
}

function boot() {
  linkRepo();
  resize();
  window.addEventListener('resize', resize);

  setInk(press.settings.ink, press.settings.ground);
  setLang(state.lang);

  bindRange('size', (v) => `${v} px`, (v) => { state.size = v; });
  bindRange('cohesion', (v) => `${v}%`, (v) => { ink.params.cohesion = v / 100; });
  bindRange('bloat', (v) => `${v > 0 ? '+' : ''}${v}%`, (v) => { ink.params.bloat = v / 100; });
  bindRange('noise', (v) => `${v}%`, (v) => { ink.params.noise = v / 100; });
  bindRange('anchor', (v) => `${v}%`, (v) => { ink.params.anchor = v / 100; });
  bindRange('gloss', (v) => `${v}%`, (v) => { press.settings.gloss = v / 100; });

  $('inkPicker').addEventListener('input', (e) => {
    setInk(e.target.value);
    $('palettes').querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', 'false'));
  });

  document.querySelectorAll('.tool[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('btnUndo').addEventListener('click', undo);
  $('btnSample').addEventListener('click', loadSample);
  $('btnClear').addEventListener('click', clearPaper);
  $('btnGuides').addEventListener('click', toggleGuides);
  $('btnLang').addEventListener('click', () => setLang(state.lang === 'es' ? 'en' : 'es'));
  $('btnMutate').addEventListener('click', mutate);
  $('btnFreeze').addEventListener('click', toggleFreeze);
  $('btnSVG').addEventListener('click', exportSVG);
  $('btnPNG').addEventListener('click', exportPNG);
  $('panelToggle').addEventListener('click', () => {
    const open = !body.classList.contains('panel-open');
    endIntro();
    setPanel(open);
  });
  $('panelClose').addEventListener('click', () => {
    setPanel(false);
    $('panelToggle').focus();
  });

  if (matchMedia('(pointer: coarse)').matches) pointer.touch = true;
  Ink.sampleCluster(ink, press.width, press.height);
  syncCount();
  syncUndo();
  requestAnimationFrame(frame);
}

boot();
