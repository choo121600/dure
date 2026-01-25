import express, { Express } from 'express';
import { createServer as createHttpServer, Server } from 'http';
import { Server as SocketServer } from 'socket.io';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { OrchestraConfig } from '../types/index.js';
import { Orchestrator, OrchestratorEvent } from '../core/orchestrator.js';
import { createApiRouter } from './routes/api.js';
import { createCrpRouter } from './routes/crp.js';
import { createMrpRouter } from './routes/mrp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createServer(projectRoot: string, config: OrchestraConfig): Server {
  const app: Express = express();
  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer);

  // Create orchestrator
  const orchestrator = new Orchestrator(projectRoot, config);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static files
  app.use(express.static(join(__dirname, 'public')));

  // API routes
  app.use('/api', createApiRouter(projectRoot, config, orchestrator));
  app.use('/api/crp', createCrpRouter(projectRoot, orchestrator));
  app.use('/api/mrp', createMrpRouter(projectRoot));

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
  });

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current state on connection
    const currentState = orchestrator.getCurrentState();
    if (currentState) {
      socket.emit('state_update', currentState);
    }

    // Send current agent outputs on connection
    const outputs = orchestrator.getAgentOutputs();
    if (outputs) {
      socket.emit('agent_outputs_initial', outputs);
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
      console.log('Client disconnected:', socket.id);
    });
  });

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

  return httpServer;
}
