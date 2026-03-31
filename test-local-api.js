const fs = require('fs');

async function testLocalApi() {
  // Create a 1x1 transparent red pixel image base64
  const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  
  try {
    const res = await fetch('http://localhost:3000/api/scan-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Image,
        mimeType: 'image/jpeg'
      })
    });
    
    const text = await res.text();
    console.log('Status HTTP:', res.status);
    console.log('Response Body:', text);
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

testLocalApi();
