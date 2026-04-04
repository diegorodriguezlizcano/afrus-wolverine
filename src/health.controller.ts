import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { version, description } from '../package.json';

@Controller()
export class HealthController {
  @Get()
  root(@Res() res: Response) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wolverine — afrus Commercial Agent</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #1a1a2e;
      border: 1px solid #2d2d4a;
      border-radius: 16px;
      padding: 48px;
      max-width: 520px;
      width: 90%;
      text-align: center;
    }
    .logo {
      font-size: 48px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #94a3b8;
      font-size: 15px;
      margin-bottom: 32px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #0f2817;
      border: 1px solid #16a34a;
      color: #4ade80;
      padding: 8px 16px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 24px;
    }
    .dot {
      width: 8px;
      height: 8px;
      background: #4ade80;
      border-radius: 50%;
    }
    .info {
      text-align: left;
      background: #111827;
      border-radius: 10px;
      padding: 20px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #1f2937;
    }
    .info-row:last-child { border-bottom: none; }
    .info-key { color: #64748b; font-size: 13px; }
    .info-val { color: #e2e8f0; font-size: 13px; font-family: monospace; }
    .footer {
      margin-top: 24px;
      color: #475569;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🐺</div>
    <h1>Wolverine</h1>
    <p class="subtitle">afrus Commercial Agent — Pipeline Orchestrator</p>
    <div class="status">
      <span class="dot"></span>
      System Online
    </div>
    <div class="info">
      <div class="info-row">
        <span class="info-key">Version</span>
        <span class="info-val">${version}</span>
      </div>
      <div class="info-row">
        <span class="info-key">Status</span>
        <span class="info-val">Operational</span>
      </div>
      <div class="info-row">
        <span class="info-key">API</span>
        <span class="info-val">/health</span>
      </div>
      <div class="info-row">
        <span class="info-key">CLI</span>
        <span class="info-val">docker exec wolverine ...</span>
      </div>
      <div class="info-row">
        <span class="info-key">Documentation</span>
        <span class="info-val">CRM_CONCEPTS.md</span>
      </div>
    </div>
    <p class="footer">afrus — ${new Date().getFullYear()}</p>
  </div>
</body>
</html>
    `;
    res.type('html').send(html);
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'afrus-wolverine',
    };
  }
}
