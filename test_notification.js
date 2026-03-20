const https = require('https');

const url = 'https://script.google.com/macros/s/AKfycbzTr2ZKasHnVFZbBPZ0qLatcdR7dMWYcqJ3GTs3gVA_BMr3MNYQPGois_NfHaHjVvEX/exec';

const data = JSON.stringify({
  asunto: "🧪 PRUEBA DE CONEXIÓN",
  mensaje: "Esta es una notificación de prueba enviada directamente desde el servidor para verificar que el Apps Script recibe los datos correctamente.",
  enlace: "https://balinesas-parking-bicis-etc.vercel.app",
  autor: "Asistente AI Studio"
});

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  },
  // Google Apps Script redirects on POST, so we might need to handle that if we wanted the response body,
  // but for a simple test, just sending it is enough.
};

console.log("Enviando prueba a:", url);

const req = https.request(url, options, (res) => {
  console.log(`Estado de la respuesta: ${res.statusCode}`);
  
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (error) => {
  console.error("Error en la petición:", error);
});

req.write(data);
req.end();
