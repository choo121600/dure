/**
 * Express validation middleware for API routes
 * Provides input validation to prevent security vulnerabilities
 */

import { Request, Response, NextFunction } from 'express';
import {
  isValidRunId,
  isValidCrpId,
  validateBriefing,
  validateDecision,
  sanitizeTextField,
} from '../../utils/sanitize.js';

/**
 * Middleware to validate run ID in request params
 */
export function validateRunId(req: Request, res: Response, next: NextFunction): void {
  const { runId } = req.params;

  if (!runId) {
    res.status(400).json({
      success: false,
      error: 'Run ID is required',
    });
    return;
  }

  if (!isValidRunId(runId)) {
    res.status(400).json({
      success: false,
      error: 'Invalid run ID format. Expected format: run-YYYYMMDDHHMMSS',
    });
    return;
  }

  next();
}

/**
 * Middleware to validate briefing in request body
 */
export function validateBriefingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const { briefing } = req.body;

  const validation = validateBriefing(briefing);
  if (!validation.isValid) {
    res.status(400).json({
      success: false,
      error: validation.error,
    });
    return;
  }

  next();
}

/**
 * Middleware to validate CRP ID in request params
 */
export function validateCrpId(req: Request, res: Response, next: NextFunction): void {
  const { crpId } = req.params;

  if (!crpId) {
    res.status(400).json({
      success: false,
      error: 'CRP ID is required',
    });
    return;
  }

  if (!isValidCrpId(crpId)) {
    res.status(400).json({
      success: false,
      error: 'Invalid CRP ID format',
    });
    return;
  }

  next();
}

/**
 * Middleware to validate and sanitize CRP response (VCR submission)
 * Supports both single-question (decision: string) and multi-question (decisions: object) formats
 * Also sanitizes optional text fields
 */
export function validateCRPResponse(req: Request, res: Response, next: NextFunction): void {
  const { decision, decisions, rationale, additional_notes, applies_to_future } = req.body;

  // Check if this is a multi-question response
  const isMultiQuestion = decisions !== undefined || (decision && typeof decision === 'object');

  if (isMultiQuestion) {
    // Multi-question format validation
    const decisionsObj = decisions || decision;
    if (typeof decisionsObj !== 'object' || decisionsObj === null) {
      res.status(400).json({
        success: false,
        error: 'Multi-question response requires decisions object',
      });
      return;
    }

    // Validate each decision value is a non-empty string
    for (const [questionId, optionId] of Object.entries(decisionsObj)) {
      if (typeof optionId !== 'string' || optionId.length === 0) {
        res.status(400).json({
          success: false,
          error: `Invalid decision for question ${questionId}`,
        });
        return;
      }
    }
  } else {
    // Single question format validation
    const decisionValidation = validateDecision(decision);
    if (!decisionValidation.isValid) {
      res.status(400).json({
        success: false,
        error: decisionValidation.error,
      });
      return;
    }
  }

  // Sanitize optional text fields
  req.body.rationale = sanitizeTextField(rationale, 10000);
  req.body.additional_notes = sanitizeTextField(additional_notes, 10000);

  // Validate applies_to_future (optional, should be boolean)
  if (applies_to_future !== undefined && typeof applies_to_future !== 'boolean') {
    req.body.applies_to_future = Boolean(applies_to_future);
  }

  next();
}

/**
 * Middleware to validate duration query parameter for cleaning runs
 */
export function validateDuration(req: Request, res: Response, next: NextFunction): void {
  const { olderThan } = req.query;

  if (!olderThan) {
    res.status(400).json({
      success: false,
      error: 'olderThan query parameter is required (e.g., ?olderThan=7d)',
    });
    return;
  }

  if (typeof olderThan !== 'string') {
    res.status(400).json({
      success: false,
      error: 'olderThan must be a string',
    });
    return;
  }

  // Validate duration format
  const durationPattern = /^\d+[dhms]$/;
  if (!durationPattern.test(olderThan)) {
    res.status(400).json({
      success: false,
      error: 'Invalid duration format. Use formats like 7d, 24h, 30m, 60s',
    });
    return;
  }

  next();
}

/**
 * Middleware to validate JSON content type
 */
export function validateJsonContentType(req: Request, res: Response, next: NextFunction): void {
  // Only check for POST, PUT, PATCH methods with body
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      res.status(415).json({
        success: false,
        error: 'Content-Type must be application/json',
      });
      return;
    }
  }

  next();
}

/**
 * Generic error handler for validation errors
 */
export function validationErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof SyntaxError && 'body' in err) {
    // JSON parse error
    res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
    });
    return;
  }

  next(err);
}
