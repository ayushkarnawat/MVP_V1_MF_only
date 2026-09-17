function handler(event) {
  var request = event.request;
  if (request.uri.endsWith(".json")) {
    var qs = request.querystring;
    var token = qs.token ? qs.token.value : null;
    if (token !== "${token}") {
      return {
        statusCode: 403,
        statusDescription: "Forbidden",
        headers: {
          "content-type": { value: "application/json" }
        },
        body: {
          encoding: "text",
          data: JSON.stringify({ error: "Invalid or missing token" })
        }
      };
    }
  }
  return request;
}
