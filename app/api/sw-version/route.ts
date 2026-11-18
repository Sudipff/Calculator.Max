import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

let resolvedBuildVersion: string | null = null;

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
