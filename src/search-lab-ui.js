/**
 * Search Lab UI — sole DOM writer for the Search Lab tab.
 *
 * Factory: createSearchLabUI(doc, engine, reporter) → { render }
 *
 * render() is idempotent: aborts the prior AbortController, removes any existing
 * cards by ID, and re-inserts fresh ones.  All DOM work uses createElement /
 * textContent.
 */

let controller = null;

/**
 * @param {Document} doc
 * @param {{ findNearMisses: Function, computeDayOfWeekSlump: Function, comparePeriods: Function }} engine
 * @param {{ db: Function }} reporter
 * @returns {{ render: Function }}
 */
export function createSearchLabUI(doc, engine, reporter) {
  async function render() {
    // Abort prior listeners and create a fresh controller
    if (controller) {
      controller.abort();
    }
    controller = new AbortController();
    const { signal } = controller;

    const panel = doc.getElementById('tab-search');
    if (!panel) return;

    // Remove existing cards by ID (idempotency)
    doc.getElementById('search-nearmiss-card')?.remove();
    doc.getElementById('search-slump-card')?.remove();
    doc.getElementById('search-compare-card')?.remove();

    // ── Near-Miss card ──────────────────────────────────────────────────────
    const nearMissCard = doc.createElement('div');
    nearMissCard.id = 'search-nearmiss-card';

    const nmTitle = doc.createElement('h3');
    nmTitle.textContent = 'Near-Miss Days';
    nearMissCard.appendChild(nmTitle);

    let nearMissDays = [];
    try {
      nearMissDays = await engine.findNearMisses();
    } catch (err) {
      reporter.db('❌ Search Lab load failed');
      console.error('[search-lab]', err);
      nearMissDays = [];
    }

    if (nearMissDays.length === 0) {
      const zero = doc.createElement('p');
      zero.textContent = 'No near-miss days';
      nearMissCard.appendChild(zero);
    } else {
      for (const day of nearMissDays) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.dataset.date = day.date;
        btn.dataset.action = 'open-day-drawer';
        btn.textContent = day.date;

        btn.addEventListener('click', () => {
          doc.dispatchEvent(
            new CustomEvent('ui:open-day-drawer', { detail: { date: day.date } }),
          );
        }, { signal });

        nearMissCard.appendChild(btn);
      }
    }

    panel.appendChild(nearMissCard);

    // ── Day-of-Week Slump card ──────────────────────────────────────────────
    const slumpCard = doc.createElement('div');
    slumpCard.id = 'search-slump-card';

    const slumpTitle = doc.createElement('h3');
    slumpTitle.textContent = 'Day-of-Week Slump';
    slumpCard.appendChild(slumpTitle);

    let slumpRows = [];
    try {
      slumpRows = (await engine.computeDayOfWeekSlump()) ?? [];
    } catch (err) {
      reporter.db('❌ Slump load failed');
      console.error('[search-lab]', err);
      slumpRows = [];
    }

    for (const row of slumpRows) {
      const rowEl = doc.createElement('div');
      rowEl.dataset.day = row.day;

      const label = doc.createElement('span');
      label.textContent = row.day;

      const hitRateEl = doc.createElement('span');
      hitRateEl.textContent = row.hitRate !== null
        ? `${(row.hitRate * 100).toFixed(1)}%`
        : '—';

      const avgStepsEl = doc.createElement('span');
      avgStepsEl.textContent = row.avgSteps !== null
        ? String(row.avgSteps)
        : '—';

      const distEl = doc.createElement('span');
      distEl.textContent = row.totalDistanceKm !== null
        ? `${row.totalDistanceKm.toFixed(2)} km`
        : '—';

      rowEl.appendChild(label);
      rowEl.appendChild(hitRateEl);
      rowEl.appendChild(avgStepsEl);
      rowEl.appendChild(distEl);
      slumpCard.appendChild(rowEl);
    }

    panel.appendChild(slumpCard);

  }

  return { render };
}
