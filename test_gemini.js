fetch('https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyCcq7xzjVF89-tta2v2UjpCwBhiB_i1unU')
  .then(r => r.json())
  .then(data => console.log(data.models.map(m => m.name)))
  .catch(console.error);
