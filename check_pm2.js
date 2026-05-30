const { execSync } = require('child_process');
try {
  const out = execSync('ssh -o StrictHostKeyChecking=no ubuntu@203.175.125.37 -p 29135 "pm2 jlist"', { encoding: 'utf8' });
  const data = JSON.parse(out);
  data.forEach(proc => {
    console.log(`Name: ${proc.name}`);
    console.log(`Path: ${proc.pm2_env.pm_exec_path}`);
    console.log('---');
  });
} catch(e) { console.error(e.message); }
