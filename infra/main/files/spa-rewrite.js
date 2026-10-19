// CloudFront Function (viewer-request) del comportamiento por defecto (frontend en S3).
// 1. www.<dominio> → 301 al dominio raíz, conservando ruta y query string.
// 2. Las rutas de React Router no existen como archivos: sin extensión → /index.html.
// /api/* tiene su propio comportamiento y nunca pasa por aquí.
function handler(event) {
  var request = event.request;

  var host = request.headers.host ? request.headers.host.value : '';
  if (host.indexOf('www.') === 0) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: 'https://' + host.substring(4) + request.uri + querystring(request.querystring) },
      },
    };
  }

  var lastSegment = request.uri.split('/').pop();
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}

// CloudFront entrega el query string ya separado en un objeto; se vuelve a montar tal cual.
function querystring(qs) {
  var parts = [];
  for (var key in qs) {
    var values = qs[key].multiValue || [qs[key]];
    for (var i = 0; i < values.length; i++) {
      parts.push(key + '=' + values[i].value);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}
