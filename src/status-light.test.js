import { describe, it, expect } from 'vitest';
import { levelOf, stripSymbol, renderStatusPill, STATUS_OK, STATUS_WARN, STATUS_ERROR } from './status-light.js';

describe('ST-027: a message\'s status level', () => {
  it.each([
    ['✅ Connected', STATUS_OK],
    ['⚠️ Could not reach Health Connect', STATUS_WARN],
    ['ℹ️ Google Account not connected — Drive sync unavailable', STATUS_WARN],
    ['🔑 Step access not allowed — allow it in Health Connect', STATUS_ERROR],
    ['❌ Something failed', STATUS_ERROR],
    ['Not connected', STATUS_ERROR],
    ['', STATUS_ERROR],
  ])('%s → %s', (text, level) => {
    expect(levelOf(text)).toBe(level);
  });

  it('drops the leading symbol, keeping the words', () => {
    expect(stripSymbol('⚠️ Could not reach Health Connect')).toBe('Could not reach Health Connect');
    expect(stripSymbol('🔑 Step access not allowed')).toBe('Step access not allowed');
    expect(stripSymbol('Not connected')).toBe('Not connected');
  });
});

describe('ST-027: renderStatusPill', () => {
  const pill = () => {
    const el = document.createElement('button');
    el.className = 'status-pill';
    el.textContent = 'old text';
    return el;
  };

  it('shows a glowing light of the level and a short label — no symbols', () => {
    const el = pill();
    renderStatusPill(document, el, { level: STATUS_OK, label: 'Connected', detail: 'Connected' });
    const light = el.querySelector('.status-light');
    expect(light.classList.contains('status-light--ok')).toBe(true);
    expect(light.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.status-pill__label').textContent).toBe('Connected');
    expect(el.textContent).toBe('Connected');
    expect(el.dataset.level).toBe(STATUS_OK);
  });

  it('keeps the full message as the tooltip and accessible name', () => {
    const el = pill();
    renderStatusPill(document, el, { level: STATUS_WARN, label: 'Disconnected', detail: 'Could not reach Health Connect' });
    expect(el.querySelector('.status-light--warn')).not.toBeNull();
    expect(el.title).toBe('Could not reach Health Connect');
    expect(el.getAttribute('aria-label')).toBe('Disconnected: Could not reach Health Connect');
  });

  it('a detail equal to the label is not repeated', () => {
    const el = pill();
    renderStatusPill(document, el, { level: STATUS_OK, label: 'Connected', detail: 'Connected' });
    expect(el.getAttribute('aria-label')).toBe('Connected');
  });

  it('re-rendering replaces the content', () => {
    const el = pill();
    renderStatusPill(document, el, { level: STATUS_OK, label: 'Connected', detail: 'Connected' });
    renderStatusPill(document, el, { level: STATUS_ERROR, label: 'Disconnected', detail: 'Not connected' });
    expect(el.querySelectorAll('.status-light')).toHaveLength(1);
    expect(el.querySelector('.status-light--error')).not.toBeNull();
    expect(el.dataset.level).toBe(STATUS_ERROR);
  });
});
