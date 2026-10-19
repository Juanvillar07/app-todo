// CloudFront Function (viewer-request) del comportamiento por defecto (frontend en S3).
// Las rutas de React Router no existen como archivos: sin extensión → /index.html.
// /api/* tiene su propio comportamiento y nunca pasa por aquí.
function handler(event) {
  var request = event.request;
  var lastSegment = request.uri.split('/').pop();
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
