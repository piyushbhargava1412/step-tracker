import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Documentation - README.md Setup Section', () => {
  let readmeContent;

  beforeEach(() => {
    const readmePath = path.resolve(__dirname, '../README.md');
    readmeContent = fs.readFileSync(readmePath, 'utf-8');
  });

  describe('Happy Path', () => {
    it('README.md contains ## Setup heading', () => {
      expect(readmeContent).toContain('## Setup');
    });

    it('README.md mentions .env.example', () => {
      expect(readmeContent).toContain('.env.example');
    });

    it('README.md mentions .env.local', () => {
      expect(readmeContent).toContain('.env.local');
    });

    it('README.md mentions VITE_CLIENT_ID', () => {
      expect(readmeContent).toContain('VITE_CLIENT_ID');
    });

    it('README.md references port 1981', () => {
      expect(readmeContent).toContain('1981');
    });

    it('README.md references Google Cloud Console', () => {
      expect(readmeContent).toContain('Google Cloud Console');
    });

    it('README.md mentions npm install', () => {
      expect(readmeContent).toContain('npm install');
    });

    it('README.md mentions npm run dev', () => {
      expect(readmeContent).toContain('npm run dev');
    });
  });

  describe('Edge Cases', () => {
    it('README.md does not contain a real OAuth client id', () => {
      const hasRealClientId = /VITE_CLIENT_ID=[\w\-_\.]+/.test(readmeContent) &&
                              !/VITE_CLIENT_ID=</.test(readmeContent) &&
                              !/VITE_CLIENT_ID=YOUR_/.test(readmeContent);
      expect(hasRealClientId).toBe(false);
    });
  });
});

describe('Documentation - google-account-connection.md OAuth Flow', () => {
  let flowContent;

  beforeEach(() => {
    const flowPath = path.resolve(__dirname, '../.context/flows/google-account-connection.md');
    flowContent = fs.readFileSync(flowPath, 'utf-8');
  });

  describe('Happy Path', () => {
    it('google-account-connection.md references fitness.location.read', () => {
      expect(flowContent).toContain('fitness.location.read');
    });

    it('google-account-connection.md references import.meta.env.VITE_CLIENT_ID', () => {
      expect(flowContent).toContain('import.meta.env.VITE_CLIENT_ID');
    });
  });

  describe('Regression Tests', () => {
    it('google-account-connection.md still references fitness.activity.read (additive, not replace)', () => {
      expect(flowContent).toContain('fitness.activity.read');
    });
  });
});

describe('Documentation - Step Sync (README.md & historical-step-sync.md)', () => {
  let readmeContent;
  let flowContent;

  beforeEach(() => {
    const readmePath = path.resolve(__dirname, '../README.md');
    const flowPath = path.resolve(
      __dirname,
      '../.context/flows/historical-step-sync.md'
    );
    readmeContent = fs.readFileSync(readmePath, 'utf-8');
    flowContent = fs.readFileSync(flowPath, 'utf-8');
  });

  describe('README.md Step Sync section', () => {
    it('README.md documents the broad step_count.delta query without a dataSourceId', () => {
      expect(readmeContent).toContain('step_count.delta');
      expect(readmeContent).toContain('dataSourceId');
    });

    it('README.md documents the dual distance.delta aggregation and the step-derived fallback', () => {
      expect(readmeContent).toContain('distance.delta');
      expect(readmeContent).toContain('0.000762');
    });

    it('README.md documents local-midnight (not UTC) bucket construction', () => {
      expect(readmeContent).toContain('local midnight');
    });

    it('README.md documents the 2013-01-01 history anchor and a multi-minute first sync', () => {
      expect(readmeContent).toContain('2013-01-01');
      expect(readmeContent).toContain('several minutes');
    });

    it('README.md documents fail-stop interrupted-backfill resume at the correct older date', () => {
      expect(readmeContent).toContain('resume');
      expect(readmeContent).toContain('skips the latch write');
    });

    it('README.md documents the one-time initial_backfill_complete latch', () => {
      expect(readmeContent).toContain('initial_backfill_complete');
    });

    it('README.md documents the 3-day safety buffer (SAFETY_BUFFER_DAYS)', () => {
      expect(readmeContent).toContain('SAFETY_BUFFER_DAYS');
      expect(readmeContent).toContain('3-day');
    });

    it('README.md documents Bearer token usage', () => {
      expect(readmeContent).toContain('Bearer');
    });

    it('README.md documents the single 429/5xx retry and the #sync-status error surface', () => {
      expect(readmeContent).toContain('429');
      expect(readmeContent).toContain('5xx');
      expect(readmeContent).toContain('#sync-status');
    });

    it('README.md documents override preservation (is_overridden)', () => {
      expect(readmeContent).toContain('is_overridden');
    });
  });

  describe('historical-step-sync.md reflects the real engine', () => {
    it('historical-step-sync.md no longer claims the feature is unimplemented', () => {
      expect(flowContent).not.toContain('not yet implemented');
    });

    it('historical-step-sync.md no longer references the deleted legacy wiring', () => {
      expect(flowContent).not.toContain('#fetch_btn');
      expect(flowContent).not.toContain('app.js');
      expect(flowContent).not.toContain('TOTAL_DAYS');
    });

    it('historical-step-sync.md names src/steps.js and its test file', () => {
      expect(flowContent).toContain('src/steps.js');
      expect(flowContent).toContain('src/steps.test.js');
    });

    it('historical-step-sync.md records the grounded factory signature', () => {
      expect(flowContent).toContain('createStepSync(auth, db, reporter, doc = document)');
    });

    it('historical-step-sync.md documents the #sync-btn entry point', () => {
      expect(flowContent).toContain('#sync-btn');
    });

    it('historical-step-sync.md documents the daily_records and initial_backfill_complete data touchpoints', () => {
      expect(flowContent).toContain('daily_records');
      expect(flowContent).toContain('initial_backfill_complete');
    });
  });
});
