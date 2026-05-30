fetch('https://simplesplit-gasgasaja.vercel.app/api/wa-group/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'super-secret-key-123' },
  body: JSON.stringify({ command: 'bot', args: ['hutangku', 'ada', 'berapa'] })
}).then(res => res.text()).then(text => console.log('Vercel Output:', text)).catch(err => console.error(err));
