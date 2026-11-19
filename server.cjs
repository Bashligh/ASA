const { createReadStream, existsSync, statSync } = require("node:fs");
const { createServer } = require("node:http");
const { extname, join, normalize } = require("node:path");

const host = "0.0.0.0";
const port = Number(process.env.PORT || 8443);
const root = process.cwd();
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function handleMcpRequest(request, response) {
  let body = "";

  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) request.destroy();
  });

  request.on("end", () => {
    let message;
    try {
      message = body ? JSON.parse(body) : {};
    } catch {
      sendJson(response, 400, {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      });
      return;
    }

    const id = Object.prototype.hasOwnProperty.call(message, "id") ? message.id : null;
    const commonHeaders = { "Mcp-Session-Id": "asa-static-preview" };
    let result;

    switch (message.method) {
      case "initialize":
        result = {
          protocolVersion: message.params?.protocolVersion || "2024-11-05",
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: "asa-static-preview", version: "1.0.0" },
        };
        break;
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = { tools: [] };
        break;
      case "resources/list":
        result = { resources: [] };
        break;
      case "prompts/list":
        result = { prompts: [] };
        break;
      case "notifications/initialized":
        response.writeHead(202, commonHeaders);
        response.end();
        return;
      default:
        // An empty POST is used as a lightweight Make preview health probe.
        if (!message.method) {
          result = {
            protocolVersion: "2024-11-05",
            capabilities: {},
            serverInfo: { name: "asa-static-preview", version: "1.0.0" },
          };
          break;
        }
        sendJson(
          response,
          200,
          {
            jsonrpc: "2.0",
            error: { code: -32601, message: `Method not found: ${message.method}` },
            id,
          },
          commonHeaders,
        );
        return;
    }

    sendJson(response, 200, { jsonrpc: "2.0", result, id }, commonHeaders);
  });
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  // Figma Make checks this route with POST while establishing preview readiness.
  if (request.method === "POST" && url.pathname === "/api/mcp") {
    handleMcpRequest(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`ASA static preview ready at http://${host}:${port}`);
});
