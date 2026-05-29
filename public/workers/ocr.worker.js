/* eslint-disable no-undef */
importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

let worker = null;

self.onmessage = async (e) => {
  const { type, imageDataUrl, id } = e.data;

  if (type === 'recognize') {
    try {
      if (!worker) {
        worker = await Tesseract.createWorker('ind+eng', 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              self.postMessage({ type: 'progress', progress: m.progress, id });
            }
          },
        });
      }

      const result = await worker.recognize(imageDataUrl);
      self.postMessage({ type: 'result', text: result.data.text, id });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message || 'OCR failed', id });
    }
  }

  if (type === 'terminate') {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    self.postMessage({ type: 'terminated', id });
  }
};
