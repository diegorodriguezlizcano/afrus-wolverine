"""afrus-Wolverine — Hello World (stdlib only)"""
import http.server
import socketserver
import json
import socket
import datetime
import os
import signal

PORT = 3003
HOST = socket.gethostname()
START_TIME = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wolverine — afrus Commercial Agent</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #1a1a2e; border: 1px solid #2d2d4a; border-radius: 16px; padding: 48px; max-width: 560px; width: 90%; text-align: center; }
    .logo { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 30px; font-weight: 700; color: #f8fafc; margin-bottom: 8px; }
    .subtitle { color: #94a3b8; font-size: 15px; margin-bottom: 32px; }
    .status { display: inline-flex; align-items: center; gap: 8px; background: #0f2817; border: 1px solid #16a34a; color: #4ade80; padding: 8px 20px; border-radius: 9999px; font-size: 14px; font-weight: 500; margin-bottom: 28px; }
    .dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; }
    .info { text-align: left; background: #111827; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1f2937; }
    .row:last-child { border-bottom: none; }
    .key { color: #64748b; font-size: 13px; }
    .val { color: #e2e8f0; font-size: 13px; font-family: monospace; }
    .footer { margin-top: 24px; color: #475569; font-size: 12px; }
    .note { background: #1a1a0a; border: 1px solid #4a3a00; border-radius: 8px; padding: 10px 14px; text-align: left; margin-bottom: 20px; font-size: 13px; color: #fbbf24; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">&#128054;</div>
    <h1>Wolverine</h1>
    <p class="subtitle">afrus Commercial Agent — Pipeline Orchestrator</p>
    <div class="status"><span class="dot"></span>System Online</div>
    <div class="note">PostgreSQL not connected yet. Run ISS-002 to enable persistence.</div>
    <div class="info">
      <div class="row"><span class="key">Version</span><span class="val">0.1.0</span></div>
      <div class="row"><span class="key">Framework</span><span class="val">Python stdlib HTTP</span></div>
      <div class="row"><span class="key">Status</span><span class="val" style="color:#4ade80">Operational</span></div>
      <div class="row"><span class="key">Host</span><span class="val">""" + HOST + """</span></div>
      <div class="row"><span class="key">Port</span><span class="val">""" + str(PORT) + """</span></div>
      <div class="row"><span class="key">API</span><span class="val">GET /api/health</span></div>
      <div class="row"><span class="key">Started</span><span class="val">""" + START_TIME + """</span></div>
    </div>
    <p class="footer">afrus — """ + str(datetime.datetime.now().year) + """</p>
  </div>
</body>
</html>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.encode())
        elif self.path == "/api/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            health = {
                "status": "ok",
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                "service": "afrus-wolverine",
                "version": "0.1.0",
                "host": HOST,
                "started_at": START_TIME,
            }
            self.wfile.write(json.dumps(health).encode())
        else:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Not found")

    def log_message(self, format, *args):
        pass


class ReuseAddrTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    print("Starting Wolverine on port", PORT)
    print("URL: http://" + HOST + ":" + str(PORT))
    print("API: http://" + HOST + ":" + str(PORT) + "/api/health")
    with ReuseAddrTCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()
