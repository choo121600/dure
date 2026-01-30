import { Orchestrator } from '../src/core/orchestrator.js';
import { ConfigManager } from '../src/config/config-manager.js';

const configManager = new ConfigManager(process.cwd());
const config = configManager.loadConfig();

const runId = process.argv[2] || '';

async function main() {
  const projectRoot = process.cwd();
  const orchestrator = new Orchestrator(projectRoot, config);

  orchestrator.on('event', (event) => {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] ${event.type}`);
  });

  if (runId) {
    console.log('Resuming run:', runId);
    await orchestrator.resumeRun(runId);
  } else {
    console.log('Starting new run...');
    const briefing = process.argv[3] || 'mission-manager 테스트 추가';
    const newRunId = await orchestrator.startRun(briefing);
    console.log('Run started:', newRunId);
  }

  // Wait for completion
  await new Promise(resolve => setTimeout(resolve, 600000)); // 10 min max
}

main().catch(console.error);
