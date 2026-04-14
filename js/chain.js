'use strict';

import { registry } from './encoders.js';

/**
 * ChainEncoder — runs an ordered list of encoding steps sequentially.
 * Each step is { encoderId: string, options: object }.
 * Encoding applies steps left-to-right; decoding applies them right-to-left.
 */
class ChainEncoder {
  constructor() {
    /** @type {{ id: string, encoderId: string, options: object }[]} */
    this.steps = [];
    this._nextId = 0;
  }

  /** Append a step. Returns the generated step id. */
  addStep(encoderId, options = {}) {
    const id = `step-${this._nextId++}`;
    this.steps.push({ id, encoderId, options });
    return id;
  }

  /** Remove a step by its id. */
  removeStep(stepId) {
    const idx = this.steps.findIndex(s => s.id === stepId);
    if (idx !== -1) this.steps.splice(idx, 1);
  }

  /** Move a step from one index to another. */
  moveStep(fromIdx, toIdx) {
    if (fromIdx < 0 || fromIdx >= this.steps.length) return;
    if (toIdx < 0 || toIdx >= this.steps.length) return;
    const [step] = this.steps.splice(fromIdx, 1);
    this.steps.splice(toIdx, 0, step);
  }

  /** Update options for a specific step. */
  updateStepOptions(stepId, options) {
    const step = this.steps.find(s => s.id === stepId);
    if (step) step.options = { ...step.options, ...options };
  }

  /**
   * Run the chain forward (encode).
   * Returns { finalOutput: string, intermediates: { stepId, encoderName, output }[] }
   */
  encode(input) {
    let current = input;
    const intermediates = [];

    for (const step of this.steps) {
      const encoder = registry.get(step.encoderId);
      if (!encoder) throw new Error(`Encoder not found: ${step.encoderId}`);
      current = encoder.encode(current, step.options);
      intermediates.push({
        stepId: step.id,
        encoderName: encoder.name,
        output: current,
      });
    }

    return { finalOutput: current, intermediates };
  }

  /**
   * Run the chain in reverse (decode).
   * Returns { finalOutput: string, intermediates: { stepId, encoderName, output }[] }
   */
  decode(input) {
    let current = input;
    const intermediates = [];
    const reversed = [...this.steps].reverse();

    for (const step of reversed) {
      const encoder = registry.get(step.encoderId);
      if (!encoder) throw new Error(`Encoder not found: ${step.encoderId}`);
      if (!encoder.isDecodable || typeof encoder.decode !== 'function') {
        throw new Error(`"${encoder.name}" is not decodable — cannot reverse this chain`);
      }
      current = encoder.decode(current, step.options);
      intermediates.push({
        stepId: step.id,
        encoderName: encoder.name,
        output: current,
      });
    }

    return { finalOutput: current, intermediates };
  }

  /** Serialize chain to a portable JSON object. */
  toJSON() {
    return this.steps.map(s => ({ encoderId: s.encoderId, options: s.options }));
  }

  /** Load chain from a serialized JSON array. */
  fromJSON(arr) {
    this.steps = [];
    this._nextId = 0;
    for (const item of arr) {
      this.addStep(item.encoderId, item.options || {});
    }
  }

  clear() {
    this.steps = [];
  }
}

export { ChainEncoder };
