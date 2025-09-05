import process from 'node:process';

async function main() {
  const base = process.env.STAGING_CANARY_URL;
  if (!base) {
    console.error('STAGING_CANARY_URL not set');
    process.exit(1);
  }

  const deployRes = await fetch(`${base}/deploy`, { method: 'POST' });
  if (!deployRes.ok) {
    console.error(`Deploy failed: ${deployRes.status}`);
    process.exit(1);
  }

  const health = await fetch(`${base}/health/ready`);
  if (!health.ok) {
    console.error(`Health check failed: ${health.status}`);
    process.exit(1);
  }

  console.log('staging canary deploy successful');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
