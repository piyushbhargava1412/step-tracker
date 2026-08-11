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
    nearMissCard.className = 'search-lab-card';

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
        btn.className = 'search-insight-row';

        const dateText = doc.createTextNode(day.date + ' — ');
        const remainingSpan = doc.createElement('span');
        const remaining = (day.target - day.effectiveDistanceKm).toFixed(2);
        remainingSpan.textContent = remaining + ' km remaining';
        btn.appendChild(dateText);
        btn.appendChild(remainingSpan);

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
    slumpCard.className = 'search-lab-card';

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

    const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < slumpRows.length; i++) {
      const row = slumpRows[i];
      const dayLabel = row.day ?? DOW_LABELS[i] ?? String(i);
      const rowEl = doc.createElement('div');
      rowEl.dataset.day = dayLabel;
      rowEl.classList.add('search-insight-row');
      if (row.primarySlump) {
        rowEl.classList.add('search-insight-row--slump');
        rowEl.dataset.slump = 'true';
      }

      const label = doc.createElement('span');
      label.textContent = dayLabel;

      if (row.primarySlump) {
        const slumpBadge = doc.createElement('span');
        slumpBadge.className = 'search-insight-slump-badge';
        slumpBadge.textContent = 'Primary Slump Day';
        rowEl.appendChild(slumpBadge);
      }

      const hitRateEl = doc.createElement('span');
      hitRateEl.textContent = row.hitRate !== null
        ? `${row.hitRate.toFixed(1)}%`
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

    // ── Comparison card ─────────────────────────────────────────────────────
    const compareCard = doc.createElement('div');
    compareCard.id = 'search-compare-card';
    compareCard.className = 'search-lab-card';

    const cmpTitle = doc.createElement('h3');
    cmpTitle.textContent = 'Period Comparison';
    compareCard.appendChild(cmpTitle);

    // Four date inputs
    const inputDefs = [
      ['compare-a-start', 'Period A Start'],
      ['compare-a-end', 'Period A End'],
      ['compare-b-start', 'Period B Start'],
      ['compare-b-end', 'Period B End'],
    ];

    for (const [tag, label] of inputDefs) {
      const lbl = doc.createElement('label');
      lbl.textContent = label;

      const input = doc.createElement('input');
      input.type = 'date';
      input.dataset.compare = tag;

      lbl.appendChild(input);
      compareCard.appendChild(lbl);
    }

    // Compare trigger button
    const cmpBtn = doc.createElement('button');
    cmpBtn.type = 'button';
    cmpBtn.dataset.action = 'compare-periods';
    cmpBtn.textContent = 'Compare';
    compareCard.appendChild(cmpBtn);

    // Results container (always present)
    const resultsEl = doc.createElement('div');
    resultsEl.dataset.id = 'compare-results';
    compareCard.appendChild(resultsEl);

    function formatDelta(value) {
      if (value === null || value === undefined) return '—';
      const sign = value >= 0 ? '+' : '';
      return `${sign}${value.toFixed(1)}%`;
    }

    function renderCompareResults(result) {
      resultsEl.textContent = '';
      const { periodA, periodB, deltas } = result;

      const rows = [
        { label: 'Total Steps', a: periodA.totalSteps, b: periodB.totalSteps, delta: deltas.totalSteps },
        { label: 'Distance (km)', a: periodA.totalDistanceKm?.toFixed(2), b: periodB.totalDistanceKm?.toFixed(2), delta: deltas.totalDistanceKm },
        { label: 'Hit Rate', a: periodA.hitRate !== null ? periodA.hitRate.toFixed(1) + '%' : '—', b: periodB.hitRate !== null ? periodB.hitRate.toFixed(1) + '%' : '—', delta: deltas.hitRate },
      ];

      for (const row of rows) {
        const rowEl = doc.createElement('div');
        rowEl.className = 'search-compare-table';

        const lblEl = doc.createElement('span');
        lblEl.textContent = row.label;

        const aEl = doc.createElement('span');
        aEl.textContent = row.a ?? '—';

        const bEl = doc.createElement('span');
        bEl.textContent = row.b ?? '—';

        const deltaEl = doc.createElement('span');
        deltaEl.textContent = formatDelta(row.delta);

        rowEl.appendChild(lblEl);
        rowEl.appendChild(aEl);
        rowEl.appendChild(bEl);
        rowEl.appendChild(deltaEl);
        resultsEl.appendChild(rowEl);
      }
    }

    function renderCompareZeroState(message) {
      resultsEl.textContent = '';
      const p = doc.createElement('p');
      p.textContent = message;
      resultsEl.appendChild(p);
    }

    cmpBtn.addEventListener('click', async () => {
      const aStart = compareCard.querySelector('[data-compare="compare-a-start"]').value;
      const aEnd = compareCard.querySelector('[data-compare="compare-a-end"]').value;
      const bStart = compareCard.querySelector('[data-compare="compare-b-start"]').value;
      const bEnd = compareCard.querySelector('[data-compare="compare-b-end"]').value;

      if (!aStart || !aEnd || !bStart || !bEnd) {
        renderCompareZeroState('Please select all four dates to compare periods.');
        return;
      }

      try {
        const result = await engine.comparePeriods(
          { startDate: aStart, endDate: aEnd },
          { startDate: bStart, endDate: bEnd },
        );
        renderCompareResults(result);
      } catch (err) {
        reporter.db('❌ Comparison failed');
        console.error('[search-lab]', err);
        renderCompareZeroState('Comparison failed. Please try again.');
      }
    }, { signal });

    panel.appendChild(compareCard);


  }

  return { render };
}
