import { describe, it, expect } from 'vitest';
import { selectAccess, applyAccess, ACCESS_EDITOR, ACCESS_VIEWER } from './access.js';

describe('ST-023: access role per platform', () => {
  it('the Android app edits', () => {
    expect(selectAccess({ isNative: true })).toEqual({ role: ACCESS_EDITOR, canEdit: true });
  });

  it('the browser views', () => {
    expect(selectAccess({ isNative: false })).toEqual({ role: ACCESS_VIEWER, canEdit: false });
  });

  it('marks the document with the role, for the markup gating rules', () => {
    const doc = document.implementation.createHTMLDocument('t');
    applyAccess(doc, selectAccess({ isNative: false }));
    expect(doc.documentElement.dataset.access).toBe('viewer');
    applyAccess(doc, selectAccess({ isNative: true }));
    expect(doc.documentElement.dataset.access).toBe('editor');
  });

  it('tolerates a missing document', () => {
    expect(() => applyAccess(null, selectAccess({ isNative: false }))).not.toThrow();
  });
});
