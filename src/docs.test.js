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
    it('documents the broad step_count.delta query without a dataSourceId', () => {
      expect(readmeContent).toContain('step_count.delta');
    });

    it('documents dual aggregation with distance.delta and the step-derived fallback', () => {
      expect(readmeContent).toContain('distance.delta');
    });

    it('documents local-midnight (not UTC) bucket construction', () => {
      expect(readmeContent).toContain('local midnight');
    });

    it('documents the 2013-01-01 history anchor and the one-time backfill latch', () => {
      expect(readmeContent).toContain('2013-01-01');
      expect(readmeContent).toContain('initial_backfill_complete');
    });

    it('documents fail-stop interrupted-backfill resume', () => {
      expect(readmeContent).toContain('resume');
    });

    it('documents the 3-day safety buffer (SAFETY_BUFFER_DAYS)', () => {
      expect(readmeContent).toContain('SAFETY_BUFFER_DAYS');
    });

    it('documents Bearer token usage', () => {
      expect(readmeContent).toContain('Bearer');
    });

    it('documents the retry policy and the #sync-status error surface', () => {
      expect(readmeContent).toContain('#sync-status');
    });

    it('documents override preservation (is_overridden)', () => {
      expect(readmeContent).toContain('is_overridden');
    });
  });

  describe('historical-step-sync.md reflects the real engine', () => {
    it('no longer claims the feature is unimplemented', () => {
      expect(flowContent).not.toContain('not yet implemented');
    });

    it('no longer references the deleted legacy wiring', () => {
      expect(flowContent).not.toContain('#fetch_btn');
      expect(flowContent).not.toContain('app.js');
      expect(flowContent).not.toContain('TOTAL_DAYS');
    });

    it('names src/steps.js, the factory signature, and the #sync-btn entry point', () => {
      expect(flowContent).toContain('src/steps.js');
      expect(flowContent).toContain('createStepSync(auth, db, reporter, doc = document)');
      expect(flowContent).toContain('#sync-btn');
    });

    it('documents the daily_records and initial_backfill_complete data touchpoints', () => {
      expect(flowContent).toContain('daily_records');
      expect(flowContent).toContain('initial_backfill_complete');
    });
  });
});
