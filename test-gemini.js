const https = require('https');
const fs = require('fs');

const apiKey = 'AIzaSyD40UeUiFA2cVBTGJuC0x9i5yzewHIKuvU';
const data = JSON.stringify({
  contents: [{ parts: [{ text: "Halo, tes koneksi 123." }] }]
});

const options = {
  hostname: 'generativelanguage.googleapis.com',
  path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    fs.writeFileSync('gemini_error.json', body);
    console.log('Saved to gemini_error.json');
  });
});

req.write(data);
req.end();
