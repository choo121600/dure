#!/usr/bin/env node

import {
  isRecordingEnabled,
  enableRecording,
  getRecordingOptionsFromEnv,
} from './utils/recording.js';
import { createProgram } from './program.js';

// Enable screenshot recording if environment variable is set
// This has zero impact on normal CLI usage
if (isRecordingEnabled()) {
  const options = getRecordingOptionsFromEnv();
  if (options) {
    enableRecording(options);
  }
}

const program = createProgram();
program.parse();
