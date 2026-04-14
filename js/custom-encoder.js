'use strict';

import { registry } from './encoders.js';

/**
 * CustomEncoderBuilder — lets users define encoders with JavaScript
 * function bodies at runtime.  Encoders can be exported as JSON for
 * sharing in the community-encoders/ folder.
 */
class CustomEncoderBuilder {

  /**
   * Validate and build an encoder definition from user-supplied data.
   *
   * @param {object} def
   * @param {string} def.id          - Unique slug (auto-generated if blank)
   * @param {string} def.name        - Display name
   * @param {string} def.description - Short description
   * @param {string} def.author      - Author name / handle
   * @param {boolean} def.isDecodable
   * @param {string} def.encodeBody  - JS function body (params: input, options)
   * @param {string} def.decodeBody  - JS function body (optional)
   * @param {{ id:string, name:string, type:string, default:any }[]} def.options
   * @returns {object} A validated encoder object ready for registry.register()
   */
  static build(def) {
    if (!def.name || !def.name.trim()) {
      throw new Error('Encoder name is required');
    }
    if (!def.encodeBody || !def.encodeBody.trim()) {
      throw new Error('Encode function body is required');
    }

    const id = def.id || CustomEncoderBuilder.slugify(def.name);
    if (registry.has(id)) {
      throw new Error(`An encoder with id "${id}" already exists`);
    }

    // Compile function bodies into actual functions.
    // Errors here surface as clear SyntaxErrors.
    let encodeFn, decodeFn;
    try {
      encodeFn = new Function('input', 'options', def.encodeBody);
    } catch (err) {
      throw new Error(`Encode function syntax error: ${err.message}`);
    }

    const isDecodable = def.isDecodable !== false && !!def.decodeBody?.trim();
    if (isDecodable) {
      try {
        decodeFn = new Function('input', 'options', def.decodeBody);
      } catch (err) {
        throw new Error(`Decode function syntax error: ${err.message}`);
      }
    }

    return {
      id,
      name: def.name.trim(),
      description: (def.description || '').trim(),
      author: (def.author || 'Anonymous').trim(),
      category: 'Custom',
      isDecodable,
      isCustom: true,
      options: Array.isArray(def.options) ? def.options : [],
      encode: encodeFn,
      decode: isDecodable
        ? decodeFn
        : () => { throw new Error('This encoder does not support decoding'); },
    };
  }

  /** Register a custom encoder into the global registry. */
  static register(def) {
    const encoder = CustomEncoderBuilder.build(def);
    registry.register(encoder);
    return encoder;
  }

  /**
   * Serialize a custom encoder definition to a JSON-safe object
   * (for export / community sharing).
   */
  static toJSON(def) {
    return {
      id: def.id || CustomEncoderBuilder.slugify(def.name),
      name: def.name,
      description: def.description || '',
      author: def.author || 'Anonymous',
      version: '1.0.0',
      isDecodable: def.isDecodable !== false && !!def.decodeBody?.trim(),
      options: def.options || [],
      encodeBody: def.encodeBody,
      decodeBody: def.decodeBody || '',
    };
  }

  /** Load an encoder definition from a JSON object (inverse of toJSON). */
  static fromJSON(json) {
    return CustomEncoderBuilder.build({
      id: json.id,
      name: json.name,
      description: json.description,
      author: json.author,
      isDecodable: json.isDecodable,
      encodeBody: json.encodeBody,
      decodeBody: json.decodeBody,
      options: json.options,
    });
  }

  static slugify(name) {
    return 'custom-' + name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

export { CustomEncoderBuilder };
