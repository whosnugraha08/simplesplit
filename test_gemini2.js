fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyCcq7xzjVF89-tta2v2UjpCwBhiB_i1unU', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
}).then(r => r.json()).then(console.log).catch(console.error);
