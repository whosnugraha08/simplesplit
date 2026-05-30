fetch('https://simplesplit-gasgasaja.vercel.app/api/wa-group/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-webhook-secret': 'super-secret-key-123'
  },
  body: JSON.stringify({ command: 'bot', args: ['halo'] })
}).then(r => r.json()).then(console.log).catch(console.error);
