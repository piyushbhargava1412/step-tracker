import { describe, it, expect } from 'vitest';
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
      // Check that the client id is only a placeholder (contains < and > or starts with YOUR_)
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
