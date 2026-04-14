'use strict';

import { registry }            from './encoders.js';
import { ChainEncoder }        from './chain.js';
import { CustomEncoderBuilder } from './custom-encoder.js';
import { CommunityLoader }     from './community-loader.js';

// ============================================================
//  Helpers
// ============================================================

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-container').append(el);
  setTimeout(() => el.remove(), 3500);
}

/** Build option inputs for an encoder's options array. */
function renderOptions(container, options, values = {}) {
  container.innerHTML = '';
  if (!options || options.length === 0) return;

  for (const opt of options) {
    const group = document.createElement('div');
    group.className = 'opt-group';

    const label = document.createElement('label');
    label.textContent = opt.name;
    label.setAttribute('for', `opt-${opt.id}`);
    group.append(label);

    let input;
    if (opt.type === 'select') {
      input = document.createElement('select');
      for (const c of opt.choices || []) {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        input.append(o);
      }
    } else if (opt.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = values[opt.id] ?? opt.default ?? false;
    } else {
      input = document.createElement('input');
      input.type = opt.type === 'password' ? 'password'
                 : opt.type === 'number'   ? 'number' : 'text';
      if (opt.min != null) input.min = opt.min;
      if (opt.max != null) input.max = opt.max;
    }

    input.id = `opt-${opt.id}`;
    input.dataset.optId = opt.id;
    if (opt.type !== 'checkbox') {
      input.value = values[opt.id] ?? opt.default ?? '';
    }
    group.append(input);
    container.append(group);
  }
}

/** Read current option values from rendered inputs. */
function readOptions(container) {
  const vals = {};
  for (const input of $$('[data-opt-id]', container)) {
    const id = input.dataset.optId;
    vals[id] = input.type === 'checkbox' ? input.checked : input.value;
  }
  return vals;
}

// ============================================================
//  Tab Navigation
// ============================================================

function initTabs() {
  const btns = $$('.tab-btn');
  const panels = $$('.tab-panel');

  for (const btn of btns) {
    btn.addEventListener('click', () => {
      for (const b of btns) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); }
      for (const p of panels) p.classList.remove('active');
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      $(`#tab-${btn.dataset.tab}`).classList.add('active');
    });
  }
}

// ============================================================
//  Copy Buttons
// ============================================================

function initCopy() {
  for (const btn of $$('.copy-btn[data-copy]')) {
    btn.addEventListener('click', () => {
      const target = $(`#${btn.dataset.copy}`);
      if (!target || !target.value) return;
      navigator.clipboard.writeText(target.value).then(
        () => toast('Copied to clipboard', 'success'),
        () => toast('Copy failed', 'error'),
      );
    });
  }
}

// ============================================================
//  TAB 1 — Single Encode / Decode
// ============================================================

let singleSelectedId = null;
let singleDirection  = 'encode';

function initSingle() {
  const listEl    = $('#single-encoder-list');
  const optionsEl = $('#single-options');
  const labelEl   = $('#single-encoder-label');

  // Build encoder grid grouped by category
  function rebuildGrid() {
    listEl.innerHTML = '';
    for (const [cat, encoders] of registry.getCategories()) {
      const catLabel = document.createElement('div');
      catLabel.className = 'category-label';
      catLabel.textContent = cat;
      listEl.append(catLabel);

      const grid = document.createElement('div');
      grid.className = 'encoder-grid';
      for (const enc of encoders) {
        const btn = document.createElement('button');
        btn.className = 'encoder-grid-btn';
        btn.dataset.id = enc.id;
        btn.textContent = enc.name;
        btn.title = enc.description;
        if (enc.id === singleSelectedId) btn.classList.add('selected');
        btn.addEventListener('click', () => selectEncoder(enc.id));
        grid.append(btn);
      }
      listEl.append(grid);
    }
  }

  function selectEncoder(id) {
    singleSelectedId = id;
    const enc = registry.get(id);
    // Update button states
    for (const btn of $$('.encoder-grid-btn', listEl)) {
      btn.classList.toggle('selected', btn.dataset.id === id);
    }
    labelEl.textContent = `${enc.name} — ${enc.description}`;
    renderOptions(optionsEl, enc.options);
  }

  rebuildGrid();
  // Expose rebuild so community/custom can refresh the list
  window.__rebuildSingleGrid = rebuildGrid;

  // Direction toggle
  for (const btn of $$('#single-direction button')) {
    btn.addEventListener('click', () => {
      $$('#single-direction button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      singleDirection = btn.dataset.dir;
    });
  }

  // Run
  $('#single-run').addEventListener('click', () => {
    if (!singleSelectedId) { toast('Select an encoder first', 'error'); return; }
    const enc = registry.get(singleSelectedId);
    if (!enc) { toast('Encoder not found', 'error'); return; }

    const input = $('#single-input').value;
    const opts  = readOptions(optionsEl);

    try {
      if (singleDirection === 'decode') {
        if (!enc.isDecodable) throw new Error(`${enc.name} does not support decoding`);
        $('#single-output').value = enc.decode(input, opts);
      } else {
        $('#single-output').value = enc.encode(input, opts);
      }
    } catch (err) {
      toast(err.message, 'error');
      $('#single-output').value = '';
    }
  });

  // Clear
  $('#single-clear-input').addEventListener('click', () => {
    $('#single-input').value = '';
    $('#single-output').value = '';
  });

  // Swap
  $('#single-swap').addEventListener('click', () => {
    const tmp = $('#single-input').value;
    $('#single-input').value = $('#single-output').value;
    $('#single-output').value = tmp;
  });
}

// ============================================================
//  TAB 2 — Chain Encoder
// ============================================================

const chain = new ChainEncoder();
let chainDirection = 'encode';
let chainSelectedStepId = null;

function initChain() {
  const stepsEl   = $('#chain-steps');
  const selectEl  = $('#chain-add-select');
  const interEl   = $('#chain-intermediates');
  const optCard   = $('#chain-step-options');
  const optTitle  = $('#chain-step-options-title');
  const optBody   = $('#chain-step-options-body');

  function rebuildSelect() {
    const current = selectEl.value;
    selectEl.innerHTML = '<option value="">-- Select encoder to add --</option>';
    for (const [cat, encoders] of registry.getCategories()) {
      const group = document.createElement('optgroup');
      group.label = cat;
      for (const enc of encoders) {
        const opt = document.createElement('option');
        opt.value = enc.id;
        opt.textContent = enc.name;
        group.append(opt);
      }
      selectEl.append(group);
    }
    selectEl.value = current;
  }

  function renderSteps() {
    stepsEl.innerHTML = '';
    if (chain.steps.length === 0) {
      stepsEl.innerHTML = '<div class="chain-empty">No steps added yet. Build your encoding chain above.</div>';
      optCard.style.display = 'none';
      return;
    }

    chain.steps.forEach((step, idx) => {
      if (idx > 0) {
        const arrow = document.createElement('div');
        arrow.className = 'chain-arrow';
        arrow.textContent = '\u2193';
        stepsEl.append(arrow);
      }

      const enc = registry.get(step.encoderId);
      const el = document.createElement('div');
      el.className = 'chain-step';
      el.dataset.stepId = step.id;

      el.innerHTML = `
        <span class="step-num">${idx + 1}</span>
        <span class="step-name">${enc ? enc.name : step.encoderId}</span>
        <span class="step-opts text-small text-dim"></span>
      `;

      // Options summary
      const optKeys = Object.keys(step.options).filter(k => step.options[k]);
      if (optKeys.length) {
        el.querySelector('.step-opts').textContent =
          optKeys.map(k => `${k}: ${step.options[k]}`).join(', ');
      }

      // Config button
      if (enc && enc.options.length) {
        const cfgBtn = document.createElement('button');
        cfgBtn.className = 'btn btn-small';
        cfgBtn.textContent = 'Config';
        cfgBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          chainSelectedStepId = step.id;
          optCard.style.display = '';
          optTitle.textContent = `Step ${idx + 1} — ${enc.name}`;
          renderOptions(optBody, enc.options, step.options);
          // Live-save options on input change
          optBody.oninput = () => {
            chain.updateStepOptions(step.id, readOptions(optBody));
            renderSteps();
          };
        });
        el.append(cfgBtn);
      }

      // Move buttons
      if (idx > 0) {
        const up = document.createElement('button');
        up.className = 'btn btn-small';
        up.textContent = '\u2191';
        up.title = 'Move up';
        up.addEventListener('click', (e) => { e.stopPropagation(); chain.moveStep(idx, idx - 1); renderSteps(); });
        el.append(up);
      }
      if (idx < chain.steps.length - 1) {
        const down = document.createElement('button');
        down.className = 'btn btn-small';
        down.textContent = '\u2193';
        down.title = 'Move down';
        down.addEventListener('click', (e) => { e.stopPropagation(); chain.moveStep(idx, idx + 1); renderSteps(); });
        el.append(down);
      }

      // Remove
      const rm = document.createElement('button');
      rm.className = 'btn btn-small btn-danger';
      rm.textContent = '\u00D7';
      rm.title = 'Remove step';
      rm.addEventListener('click', (e) => { e.stopPropagation(); chain.removeStep(step.id); renderSteps(); });
      el.append(rm);

      stepsEl.append(el);
    });
  }

  rebuildSelect();
  window.__rebuildChainSelect = rebuildSelect;

  // Add step
  $('#chain-add-btn').addEventListener('click', () => {
    const id = selectEl.value;
    if (!id) { toast('Select an encoder first', 'error'); return; }
    const enc = registry.get(id);
    const defaults = {};
    for (const opt of enc.options) defaults[opt.id] = opt.default ?? '';
    chain.addStep(id, defaults);
    renderSteps();
  });

  // Direction
  for (const btn of $$('#chain-direction button')) {
    btn.addEventListener('click', () => {
      $$('#chain-direction button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chainDirection = btn.dataset.dir;
    });
  }

  // Run chain
  $('#chain-run').addEventListener('click', () => {
    if (chain.steps.length === 0) { toast('Add at least one step', 'error'); return; }
    const input = $('#chain-input').value;
    try {
      const result = chainDirection === 'decode'
        ? chain.decode(input)
        : chain.encode(input);

      $('#chain-output').value = result.finalOutput;

      // Show intermediates
      interEl.innerHTML = '';
      for (const step of result.intermediates) {
        const div = document.createElement('div');
        div.className = 'intermediate-step';
        div.innerHTML = `
          <div class="int-label">${step.encoderName}</div>
          <div class="int-value">${escapeHtml(step.output)}</div>
        `;
        interEl.append(div);
      }
    } catch (err) {
      toast(err.message, 'error');
      $('#chain-output').value = '';
      interEl.innerHTML = '';
    }
  });

  // Clear
  $('#chain-clear').addEventListener('click', () => {
    chain.clear();
    renderSteps();
    $('#chain-input').value = '';
    $('#chain-output').value = '';
    interEl.innerHTML = '';
    optCard.style.display = 'none';
  });

  // Export chain as JSON
  $('#chain-export').addEventListener('click', () => {
    if (chain.steps.length === 0) { toast('Chain is empty', 'error'); return; }
    downloadJSON(chain.toJSON(), 'encoding-chain.json');
    toast('Chain exported', 'success');
  });

  // Import chain
  $('#chain-import').addEventListener('click', () => {
    openFileDialog(json => {
      try {
        chain.fromJSON(json);
        renderSteps();
        toast('Chain imported', 'success');
      } catch (err) {
        toast(`Import failed: ${err.message}`, 'error');
      }
    });
  });

  renderSteps();
}

// ============================================================
//  TAB 3 — Custom Encoder Builder
// ============================================================

function initBuilder() {
  const decodableCheckbox = $('#builder-decodable');
  const decodeCard = $('#builder-decode-card');
  const errorEl = $('#builder-error');

  decodableCheckbox.addEventListener('change', () => {
    decodeCard.style.display = decodableCheckbox.checked ? '' : 'none';
  });

  function getDef() {
    return {
      name:       $('#builder-name').value,
      description: $('#builder-desc').value,
      author:     $('#builder-author').value,
      isDecodable: decodableCheckbox.checked,
      encodeBody: $('#builder-encode').value,
      decodeBody: $('#builder-decode').value,
      options:    [],
    };
  }

  // Test encode
  $('#builder-test-encode').addEventListener('click', () => {
    errorEl.textContent = '';
    try {
      const fn = new Function('input', 'options', $('#builder-encode').value);
      $('#builder-test-output').value = fn($('#builder-test-input').value, {});
    } catch (err) {
      errorEl.textContent = `Encode error: ${err.message}`;
    }
  });

  // Test decode
  $('#builder-test-decode').addEventListener('click', () => {
    errorEl.textContent = '';
    if (!decodableCheckbox.checked) { errorEl.textContent = 'Decoder disabled'; return; }
    try {
      const fn = new Function('input', 'options', $('#builder-decode').value);
      $('#builder-test-output').value = fn($('#builder-test-input').value, {});
    } catch (err) {
      errorEl.textContent = `Decode error: ${err.message}`;
    }
  });

  // Register
  $('#builder-register').addEventListener('click', () => {
    errorEl.textContent = '';
    try {
      const enc = CustomEncoderBuilder.register(getDef());
      toast(`"${enc.name}" registered successfully`, 'success');
      // Refresh other tabs
      if (window.__rebuildSingleGrid) window.__rebuildSingleGrid();
      if (window.__rebuildChainSelect) window.__rebuildChainSelect();
    } catch (err) {
      errorEl.textContent = err.message;
      toast(err.message, 'error');
    }
  });

  // Export
  $('#builder-export').addEventListener('click', () => {
    errorEl.textContent = '';
    try {
      const def = getDef();
      if (!def.name) throw new Error('Name is required');
      if (!def.encodeBody) throw new Error('Encode function is required');
      const json = CustomEncoderBuilder.toJSON(def);
      downloadJSON(json, `${json.id}.json`);
      toast('Encoder exported', 'success');
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // Import
  $('#builder-import').addEventListener('click', () => {
    openFileDialog(json => {
      try {
        $('#builder-name').value = json.name || '';
        $('#builder-desc').value = json.description || '';
        $('#builder-author').value = json.author || '';
        decodableCheckbox.checked = json.isDecodable !== false;
        decodeCard.style.display = decodableCheckbox.checked ? '' : 'none';
        $('#builder-encode').value = json.encodeBody || '';
        $('#builder-decode').value = json.decodeBody || '';
        toast('Encoder definition loaded', 'success');
      } catch (err) {
        toast(`Import failed: ${err.message}`, 'error');
      }
    });
  });
}

// ============================================================
//  TAB 4 — Community Encoders
// ============================================================

const communityLoader = new CommunityLoader();

async function initCommunity() {
  const gallery = $('#community-gallery');

  try {
    const index = await communityLoader.fetchIndex();
    renderGallery(index);
  } catch {
    gallery.innerHTML = '<p class="text-dim">No community encoders found, or index failed to load.</p>';
  }

  function renderGallery(index) {
    gallery.innerHTML = '';
    if (index.length === 0) {
      gallery.innerHTML = '<p class="text-dim">No community encoders available yet. Be the first to contribute!</p>';
      return;
    }

    for (const entry of index) {
      const card = document.createElement('div');
      card.className = 'community-card';

      const loaded = communityLoader.isLoaded(entry.file);
      card.innerHTML = `
        <h3>${escapeHtml(entry.name)}</h3>
        <div class="author">by ${escapeHtml(entry.author || 'Unknown')}</div>
        <div class="desc">${escapeHtml(entry.description || '')}</div>
        <span class="badge ${loaded ? 'badge-loaded' : 'badge-available'}">${loaded ? 'Loaded' : 'Available'}</span>
      `;

      if (!loaded) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-small btn-teal';
        btn.textContent = 'Load';
        btn.style.marginLeft = '.5rem';
        btn.addEventListener('click', async () => {
          try {
            await communityLoader.loadEncoder(entry.file);
            toast(`Loaded "${entry.name}"`, 'success');
            renderGallery(index);
            if (window.__rebuildSingleGrid) window.__rebuildSingleGrid();
            if (window.__rebuildChainSelect) window.__rebuildChainSelect();
          } catch (err) {
            toast(`Failed to load: ${err.message}`, 'error');
          }
        });
        card.append(btn);
      }

      gallery.append(card);
    }
  }
}

// ============================================================
//  Utility: File I/O
// ============================================================

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function openFileDialog(callback) {
  const input = $('#file-import');
  input.value = '';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        callback(JSON.parse(reader.result));
      } catch {
        toast('Invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
//  Boot
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initCopy();
  initSingle();
  initChain();
  initBuilder();
  initCommunity();
});
