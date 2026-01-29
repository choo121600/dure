import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer as createHttpServer, Server } from 'http';
import { Server as SocketServer } from 'socket.io';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import type { OrchestraConfig } from '../types/index.js';
import { Orchestrator, OrchestratorEvent } from '../core/orchestrator.js';
import { createApiRouter } from './routes/api.js';
import { createCrpRouter } from './routes/crp.js';
import { createMrpRouter } from './routes/mrp.js';
import { createHealthRouter } from './routes/health.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createDashboardSocketHandler, DashboardSocketHandler } from './dashboard/socket-handler.js';
import { GracefulShutdown, ShutdownOptions } from './shutdown.js';
import { apiKeyAuth, socketAuth, isAuthEnabled } from './middleware/auth.js';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load OpenAPI specification
let swaggerDocument: object | null = null;
try {
  const openApiPath = join(__dirname, 'openapi.yaml');
  swaggerDocument = YAML.load(openApiPath);
} catch {
  // OpenAPI spec not available, Swagger UI will be disabled
}

/**
 * Create and configure the pino logger
 */
function createLogger() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isTTY = process.stdout.isTTY ?? false;
  const usePretty = isDevelopment || isTTY;
  const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

  return pino({
    level: logLevel,
    // Use pino-pretty in development or when running in a terminal
    transport: usePretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });
}

/**
 * Security middleware configuration
 */
interface SecurityOptions {
  /** Enable/disable rate limiting (default: true) */
  rateLimit?: boolean;
  /** Rate limit window in minutes (default: 15) */
  rateLimitWindowMs?: number;
  /** Max requests per window (default: 100) */
  rateLimitMax?: number;
  /** Allowed CORS origins (default: localhost) */
  corsOrigins?: string | string[];
}

/**
 * Extended server with graceful shutdown capability
 */
export interface ExtendedServer extends Server {
  /** Graceful shutdown controller */
  gracefulShutdown: GracefulShutdown;
  /** Dashboard socket handler for real-time updates */
  dashboardSocketHandler: DashboardSocketHandler;
}

export function createServer(
  projectRoot: string,
  config: OrchestraConfig,
  securityOptions: SecurityOptions = {},
  shutdownOptions: ShutdownOptions = {}
): ExtendedServer {
  const app: Express = express();
  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, {
    cors: {
      origin: securityOptions.corsOrigins || process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true,
    },
  });

  // Create logger
  const logger = createLogger();

  // Create orchestrator
  const orchestrator = new Orchestrator(projectRoot, config);

  // ===========================================
  // Security Middleware
  // ===========================================

  // Helmet: Set various HTTP headers for security
  // Customized to allow inline scripts for the dashboard
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.socket.io', 'cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdn.jsdelivr.net'],
          fontSrc: ["'self'", 'fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for dashboard
    })
  );

  // CORS: Cross-Origin Resource Sharing
  const corsOrigins = securityOptions.corsOrigins || process.env.ALLOWED_ORIGINS?.split(',') || '*';
  app.use(
    cors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
      credentials: true,
    })
  );

  // Rate Limiting: Prevent abuse
  if (securityOptions.rateLimit !== false) {
    const windowMs = (securityOptions.rateLimitWindowMs || 15) * 60 * 1000; // Default: 15 minutes
    const max = securityOptions.rateLimitMax || 100; // Default: 100 requests per window

    const limiter = rateLimit({
      windowMs,
      max,
      message: {
        success: false,
        error: 'Too many requests, please try again later.',
      },
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      // Skip rate limiting for static files
      skip: (req: Request) => req.path.startsWith('/static') || req.path.endsWith('.html'),
    });

    app.use('/api', limiter);
  }

  // HTTP Request Logging
  app.use(
    pinoHttp({
      logger,
      // Don't log static file requests in production
      autoLogging: {
        ignore: (req: Request) => {
          const url = req.url || '';
          return (
            url.endsWith('.css') ||
            url.endsWith('.js') ||
            url.endsWith('.ico') ||
            url.endsWith('.png') ||
            url.endsWith('.svg')
          );
        },
      },
      // Custom log level based on response status
      customLogLevel: (req: Request, res: Response, err?: Error) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    })
  );

  // Health check routes (no authentication required)
  // Must be registered before API key auth middleware
  app.use('/health', createHealthRouter(projectRoot, orchestrator, config.global.tmux_session_prefix));

  // API Key Authentication (if enabled)
  app.use('/api', apiKeyAuth);

  // WebSocket Authentication
  io.use(socketAuth);

  // ===========================================
  // Body Parsing Middleware
  // ===========================================
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ===========================================
  // Static Files & Routes
  // ===========================================

  // Serve static files
  app.use(express.static(join(__dirname, 'public')));

  // Swagger UI - API Documentation
  if (swaggerDocument) {
    app.use(
      '/api-docs',
      swaggerUi.serve,
      swaggerUi.setup(swaggerDocument, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Dure API Documentation',
      })
    );
    logger.info('Swagger UI available at /api-docs');
  }

  // API routes
  app.use('/api', createApiRouter(projectRoot, config, orchestrator));
  app.use('/api/crp', createCrpRouter(projectRoot, orchestrator));
  app.use('/api/mrp', createMrpRouter(projectRoot));

  // Dashboard API routes
  app.use('/api/dashboard', createDashboardRouter(projectRoot, config, {
    tmuxSessionPrefix: config.global.tmux_session_prefix,
    outputLines: 50,
  }));

  // Dashboard Socket.io handler
  const dashboardSocketHandler = createDashboardSocketHandler(io, { logger });

  // Forward orchestrator events to Socket.io
  orchestrator.on('orchestrator_event', (event: OrchestratorEvent) => {
    io.emit('orchestrator_event', event);

    // Special handling for agent output events - emit separately for real-time streaming
    if (event.type === 'agent_output') {
      io.emit('agent_output', {
        agent: event.agent,
        content: event.content,
        runId: event.runId,
        timestamp: new Date().toISOString(),
      });
    }

    // Emit agent health events
    if (event.type === 'agent_timeout' || event.type === 'agent_stale') {
      io.emit('agent_health', {
        type: event.type,
        agent: event.agent,
        runId: event.runId,
        inactiveMs: event.type === 'agent_stale' ? event.inactiveMs : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    // Emit usage update events
    if (event.type === 'usage_updated') {
      io.emit('usage_update', {
        agent: event.agent,
        usage: event.usage,
        total: event.total,
        runId: event.runId,
        timestamp: new Date().toISOString(),
      });
    }

    // Emit model selection events
    if (event.type === 'models_selected') {
      io.emit('models_selected', {
        result: event.result,
        runId: event.runId,
        timestamp: new Date().toISOString(),
      });
    }

    // Emit agent failure events
    if (event.type === 'agent_failed') {
      io.emit('agent_failed', {
        agent: event.agent,
        errorFlag: event.errorFlag,
        runId: event.runId,
        timestamp: new Date().toISOString(),
      });
    }

    // Emit retry events
    if (event.type === 'agent_retry') {
      io.emit('agent_retry', {
        agent: event.agent,
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        runId: event.runId,
        timestamp: new Date().toISOString(),
      });
    }

    if (event.type === 'agent_retry_success') {
      io.emit('agent_retry_success', {
        agent: event.agent,
        attempt: event.attempt,
        runId: event.runId,
        timestamp: new Date().toISOString(),
      });
    }

    if (event.type === 'agent_retry_exhausted') {
      io.emit('agent_retry_exhausted', {
        agent: event.agent,
        totalAttempts: event.totalAttempts,
        runId: event.runId,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Socket.io connection handling
  io.on('connection', async (socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    // Send current state on connection
    const currentState = await orchestrator.getCurrentState();
    if (currentState) {
      socket.emit('state_update', currentState);
    }

    // Send current agent outputs on connection
    const outputs = orchestrator.getAgentOutputs();
    if (outputs) {
      socket.emit('agent_outputs_initial', outputs);
    }

    // Send current usage on connection
    const allUsage = orchestrator.getAllAgentUsage();
    const totalUsage = orchestrator.getTotalUsage();
    if (allUsage && totalUsage) {
      socket.emit('usage_initial', {
        by_agent: allUsage,
        total: totalUsage,
      });
    }

    // Send current model selection on connection
    const currentRunId = orchestrator.getCurrentRunId();
    if (currentRunId) {
      const modelSelection = await orchestrator.getModelSelectionResult(currentRunId);
      if (modelSelection) {
        socket.emit('models_selected', {
          result: modelSelection,
          runId: currentRunId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Handle request for specific agent output
    socket.on('request_agent_output', (agent: string) => {
      const validAgents = ['refiner', 'builder', 'verifier', 'gatekeeper'];
      if (validAgents.includes(agent)) {
        const output = orchestrator.forceCapture(agent as 'refiner' | 'builder' | 'verifier' | 'gatekeeper');
        socket.emit('agent_output_response', { agent, content: output || '' });
      }
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Client disconnected');
    });
  });

  // Log authentication status on server start
  if (isAuthEnabled()) {
    logger.info('API authentication is enabled');
  } else {
    logger.warn('API authentication is disabled. Set DURE_AUTH_ENABLED=true and DURE_API_KEY to enable.');
  }

  // Serve frontend pages
  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  app.get('/settings', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'settings.html'));
  });

  app.get('/run/new', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'new-run.html'));
  });

  app.get('/run/:id', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'run-detail.html'));
  });

  app.get('/run/:id/crp/:crpId', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'crp.html'));
  });

  app.get('/run/:id/mrp', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'mrp.html'));
  });

  app.get('/history', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'history.html'));
  });

  // Setup graceful shutdown
  const gracefulShutdown = new GracefulShutdown(httpServer, orchestrator, shutdownOptions, io, logger);

  // Extend httpServer with gracefulShutdown and dashboardSocketHandler
  const extendedServer = httpServer as ExtendedServer;
  extendedServer.gracefulShutdown = gracefulShutdown;
  extendedServer.dashboardSocketHandler = dashboardSocketHandler;

  return extendedServer;
}
