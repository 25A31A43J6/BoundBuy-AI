import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { apiRouter } from './server/src/routes/api.ts';
import { store } from './server/src/services/store.ts';
import { paypalService } from './server/src/services/paypal.ts';
import { trackingManager } from './server/src/services/tracking.ts';

dotenv.config();

// Sync stored settings with PayPal service on initialization
const savedSettings = store.getSettings();
const initialClientId = process.env.PAYPAL_CLIENT_ID || savedSettings.paypalClientId || '';
const initialClientSecret = process.env.PAYPAL_CLIENT_SECRET || savedSettings.paypalClientSecret || '';
const initialBaseUrl = process.env.PAYPAL_BASE_URL || savedSettings.paypalBaseUrl || 'https://api-m.sandbox.paypal.com';

if (initialClientId || initialClientSecret) {
  paypalService.updateCredentials(initialClientId, initialClientSecret, initialBaseUrl);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer() {
  const app = express();
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  const cliPort = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : null;

  const isProd = process.env.NODE_ENV === 'production' && !cliPort;
  // Dev server runs on port 3000 (or --port). In production Cloud Run, listen on process.env.PORT.
  const PORT = cliPort || (process.env.NODE_ENV === 'production' && process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

  // Explicit CORS validation: allow AI Studio preview, Cloud Run, localhost, and configured origins
  const allowedOrigins = [
    process.env.APP_URL,
    process.env.CLIENT_ORIGIN,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter(Boolean) as string[];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like server-to-server or curl)
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          /^https:\/\/.*\.run\.app$/.test(origin) ||
          /^https:\/\/.*\.ai\.studio$/.test(origin) ||
          /^http:\/\/localhost:\d+$/.test(origin) ||
          /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
        ) {
          return callback(null, true);
        }
        return callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
      },
      credentials: true,
    })
  );
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // Mount API Router under /api
  app.use('/api', apiRouter);

  // Centralized Error Handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server Error Handler]:', err);

    // 1. Zod Schema Validation Errors -> HTTP 400 Bad Request
    if (err instanceof z.ZodError || (err as any)?.name === 'ZodError') {
      const zodErr = err as z.ZodError;
      const issues = zodErr.issues || [];
      const fieldErrors = issues.map((i) => ({
        field: i.path.join('.') || 'body',
        message: i.message,
        code: i.code,
      }));
      const summary = fieldErrors.map((f) => `${f.field}: ${f.message}`).join('; ');

      return res.status(400).json({
        error: 'Validation Error',
        message: summary || 'Invalid request payload schema.',
        details: fieldErrors,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Malformed JSON syntax in request body -> HTTP 400 Bad Request
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        error: 'Malformed JSON',
        message: 'The request body could not be parsed as valid JSON.',
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Application Errors with explicitly assigned HTTP status codes
    const explicitStatus =
      (err as { statusCode?: number; status?: number }).statusCode ||
      (err as { statusCode?: number; status?: number }).status;

    if (explicitStatus && typeof explicitStatus === 'number' && explicitStatus >= 400 && explicitStatus <= 499) {
      const message = err instanceof Error ? err.message : 'Client request error';
      return res.status(explicitStatus).json({
        error: (err as any)?.errorName || 'ClientError',
        message,
        issue: (err as any)?.issue || null,
        timestamp: new Date().toISOString(),
      });
    }

    // 4. Recognized application failure conditions
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('ORDER_NOT_APPROVED')) {
      return res.status(422).json({
        error: 'ORDER_NOT_APPROVED',
        message: errMsg,
        timestamp: new Date().toISOString(),
      });
    }
    if (errMsg.includes('not found') || (err as any)?.code === 'ENOENT') {
      return res.status(404).json({
        error: 'Not Found',
        message: errMsg,
        timestamp: new Date().toISOString(),
      });
    }
    if (errMsg.includes('Unauthorized') || errMsg.includes('authentication failed')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: errMsg,
        timestamp: new Date().toISOString(),
      });
    }

    // 5. Unexpected internal server failures -> HTTP 500 without leaking stack traces or secrets
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected internal server error occurred. Please try again.',
      timestamp: new Date().toISOString(),
    });
  });

  // Frontend Serving: Vite dev server or static build
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
    console.log(`[Vite Dev] Mounted Vite middlewares on Express dev server.`);
  } else {
    // Serve production static build
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log(`[Production] Serving static files from ${distPath}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BoundBuy AI] Full-stack server running at http://0.0.0.0:${PORT}`);
    trackingManager.startPolling(5);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
