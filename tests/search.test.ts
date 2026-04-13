import { describe, it, expect } from 'vitest';
import { searchProjects } from '../src/shared/search';
import type { Registry } from '../src/shared/types';

const testRegistry: Registry = {
  projects: {
    'schoolsync': {
      path: '/Users/test/schoolsync',
      description: 'School communication app for parents and teachers',
      tags: ['react-native', 'expo', 'firebase', 'encryption'],
      patterns: {
        'e2e-encryption': 'End-to-end encryption using libsodium',
        'file-upload': 'Chunked upload with progress and retry',
      },
      links: {},
    },
    'wine-analyzer': {
      path: '/Users/test/wineanalyzer',
      description: 'AI wine label scanner and cellar management',
      tags: ['react-native', 'expo', 'supabase', 'ai', 'camera'],
      patterns: {
        'camera-scan': 'Real-time label scanning with ML Kit',
      },
      links: {},
    },
    'gts-trade': {
      path: '/Users/test/gts-trade',
      description: 'Trading platform with real-time data',
      tags: ['nextjs', 'supabase', 'websockets'],
      patterns: {
        'real-time': 'WebSocket-based live data feeds',
      },
      links: {},
    },
  },
};

describe('searchProjects', () => {
  it('finds projects by tag', () => {
    const results = searchProjects(testRegistry, 'encryption');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('schoolsync');
  });

  it('finds projects by description keyword', () => {
    const results = searchProjects(testRegistry, 'wine');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('wine-analyzer');
  });

  it('finds projects by pattern name', () => {
    const results = searchProjects(testRegistry, 'upload');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('schoolsync');
  });

  it('finds projects by pattern description', () => {
    const results = searchProjects(testRegistry, 'libsodium');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('schoolsync');
  });

  it('finds projects by name', () => {
    const results = searchProjects(testRegistry, 'gts');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('gts-trade');
  });

  it('returns multiple matches', () => {
    const results = searchProjects(testRegistry, 'react-native');
    expect(results.length).toBe(2);
  });

  it('is case-insensitive', () => {
    const results = searchProjects(testRegistry, 'FIREBASE');
    expect(results.length).toBe(1);
  });

  it('returns empty for no matches', () => {
    const results = searchProjects(testRegistry, 'nonexistent');
    expect(results.length).toBe(0);
  });
});
