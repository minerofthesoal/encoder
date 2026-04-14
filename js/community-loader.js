'use strict';

import { registry } from './encoders.js';
import { CustomEncoderBuilder } from './custom-encoder.js';

/**
 * CommunityLoader — fetches encoder definitions from the
 * community-encoders/ folder and registers them.
 *
 * The folder contains:
 *   _index.json   — array of { file, name, author, description }
 *   *.json        — individual encoder definition files
 */
class CommunityLoader {
  /**
   * @param {string} basePath  Path to community-encoders/ relative to site root.
   */
  constructor(basePath = 'community-encoders') {
    this.basePath = basePath;
    /** @type {{ file:string, name:string, author:string, description:string }[]} */
    this.index = [];
    /** @type {Map<string, object>} loaded encoder definitions keyed by file */
    this.loaded = new Map();
  }

  /** Fetch the _index.json catalogue. */
  async fetchIndex() {
    const res = await fetch(`${this.basePath}/_index.json`);
    if (!res.ok) throw new Error(`Failed to load community index: ${res.status}`);
    this.index = await res.json();
    return this.index;
  }

  /** Fetch and register a single community encoder by filename. */
  async loadEncoder(file) {
    if (this.loaded.has(file)) return this.loaded.get(file);

    const res = await fetch(`${this.basePath}/${file}`);
    if (!res.ok) throw new Error(`Failed to load encoder "${file}": ${res.status}`);
    const json = await res.json();

    const encoder = CustomEncoderBuilder.fromJSON({
      ...json,
      id: json.id || file.replace(/\.json$/, ''),
    });

    // Override category to "Community" for display grouping
    const communityEncoder = { ...encoder, category: 'Community', author: json.author || 'Unknown' };
    registry.register(communityEncoder);
    this.loaded.set(file, communityEncoder);
    return communityEncoder;
  }

  /** Load all community encoders listed in the index. */
  async loadAll() {
    if (this.index.length === 0) {
      await this.fetchIndex();
    }
    const results = [];
    for (const entry of this.index) {
      try {
        const enc = await this.loadEncoder(entry.file);
        results.push(enc);
      } catch (err) {
        console.warn(`Skipping community encoder "${entry.file}":`, err.message);
      }
    }
    return results;
  }

  /** Check if a community encoder is already loaded. */
  isLoaded(file) {
    return this.loaded.has(file);
  }
}

export { CommunityLoader };
