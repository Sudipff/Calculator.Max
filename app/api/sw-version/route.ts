import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

let resolvedBuildVersion: string | null = null;

const PREVIOUS_RELEASE_VERSION = 'v2.3.0';
const LATEST_RELEASE_VERSION = 'v2.4.0';
const LATEST_RELEASE_TITLE = 'Calculator Max';
const LATEST_RELEASE_NOTES = [
  'Offline-first PWA caching with Stale-While-Revalidate for instant startup on slow connections.',
  'Right-swipe gesture navigation across all 8 calculators and converter tools to quickly return Home.',
  'Single-screen Scientific Calculator layout with smooth top-fading history and tactile keypad feedback.',
  'Dynamic 12-hour AM/PM timestamps in Note and Task editor headers with multi-select sharing.',
];

function getDeploymentVersion(): string {
  if (resolvedBuildVersion) return resolvedBuildVersion;

  const envVersion =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.NEXT_DEPLOYMENT_ID ||
    process.env.BUILD_ID;

  if (envVersion && envVersion.trim()) {
    resolvedBuildVersion = envVersion.trim().slice(0, 24);
    return resolvedBuildVersion;
  }

  for (const dir of ['.next', 'build']) {
    try {
      const buildIdPath = path.join(process.cwd(), dir, 'BUILD_ID');
      if (fs.existsSync(buildIdPath)) {
        const id = fs.readFileSync(buildIdPath, 'utf8').trim();
        if (id) {
          resolvedBuildVersion = id;
          return resolvedBuildVersion;
        }
      }
    } catch {
      // Ignore filesystem read errors in edge/restricted runtimes
    }
  }

  resolvedBuildVersion = `v7-${process.env.NODE_ENV || 'prod'}`;
  return resolvedBuildVersion;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const version = getDeploymentVersion();
  return NextResponse.json(
    {
      cachePrefix: 'calculator-max-pwa-v7',
      version,
      currentVersion: PREVIOUS_RELEASE_VERSION,
      releaseVersion: LATEST_RELEASE_VERSION,
      releaseTitle: LATEST_RELEASE_TITLE,
      releaseNotes: LATEST_RELEASE_NOTES,
      timestamp: Date.now(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
