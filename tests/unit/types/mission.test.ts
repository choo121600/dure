import { describe, it, expect } from 'vitest';
import type {
  Mission,
  MissionPhase,
  MissionTask,
  Critique,
  CarryForward,
  PhaseContext,
  MissionGatekeeperVerdict,
} from '../../../src/types/mission.js';
import type { MissionId, PhaseId, TaskId } from '../../../src/types/branded.js';
import { unsafeCreateMissionId, unsafeCreatePhaseId, unsafeCreateTaskId } from '../../../src/types/branded.js';
import { CRITIQUE_AUTO_APPROVE_THRESHOLD } from '../../../src/types/mission.js';

describe('Mission types', () => {
  describe('MissionTask', () => {
    it('should allow valid MissionTask structure', () => {
      const task: MissionTask = {
        task_id: unsafeCreateTaskId('task-1.1'),
        phase_id: unsafeCreatePhaseId('phase-1'),
        title: 'Implement authentication',
        description: 'Add JWT-based authentication',
        briefing_path: 'docs/missions/test/tasks/1.1/briefing.md',
        depends_on: [],
        status: 'pending',
      };

      expect(task.task_id).toBe('task-1.1');
      expect(task.status).toBe('pending');
      expect(task.depends_on).toHaveLength(0);
    });

    it('should allow task with dependencies', () => {
      const task: MissionTask = {
        task_id: unsafeCreateTaskId('task-1.2'),
        phase_id: unsafeCreatePhaseId('phase-1'),
        title: 'Add middleware',
        description: 'Add authentication middleware',
        briefing_path: 'docs/missions/test/tasks/1.2/briefing.md',
        depends_on: [unsafeCreateTaskId('task-1.1')],
        status: 'blocked',
      };

      expect(task.depends_on).toHaveLength(1);
      expect(task.status).toBe('blocked');
    });

    it('should allow task with agent config override', () => {
      const task: MissionTask = {
        task_id: unsafeCreateTaskId('task-2.1'),
        phase_id: unsafeCreatePhaseId('phase-2'),
        title: 'Complex refactoring',
        description: 'Refactor core systems',
        briefing_path: 'docs/missions/test/tasks/2.1/briefing.md',
        depends_on: [],
        status: 'pending',
        agent_config: {
          model_selection: {
            builder: 'opus',
            verifier: 'sonnet',
          },
          max_iterations: 5,
          timeout_ms: 900000,
        },
      };

      expect(task.agent_config?.model_selection?.builder).toBe('opus');
      expect(task.agent_config?.max_iterations).toBe(5);
    });

    it('should allow all valid MissionTaskStatus values', () => {
      const statuses: Array<MissionTask['status']> = [
        'pending',
        'blocked',
        'in_progress',
        'passed',
        'failed',
        'skipped',
        'needs_human',
      ];

      statuses.forEach(status => {
        const task: MissionTask = {
          task_id: unsafeCreateTaskId('task-test'),
          phase_id: unsafeCreatePhaseId('phase-test'),
          title: 'Test task',
          description: 'Test',
          briefing_path: 'test',
          depends_on: [],
          status,
        };
        expect(task.status).toBe(status);
      });
    });
  });

  describe('MissionPhase', () => {
    it('should allow valid Phase structure', () => {
      const phase: MissionPhase = {
        phase_id: unsafeCreatePhaseId('phase-1'),
        mission_id: unsafeCreateMissionId('mission-20260129150000'),
        number: 1,
        title: 'Authentication Setup',
        description: 'Set up authentication system',
        tasks: [],
        status: 'pending',
      };

      expect(phase.number).toBe(1);
      expect(phase.status).toBe('pending');
      expect(phase.tasks).toHaveLength(0);
    });

    it('should allow phase with tasks', () => {
      const phase: MissionPhase = {
        phase_id: unsafeCreatePhaseId('phase-1'),
        mission_id: unsafeCreateMissionId('mission-20260129150000'),
        number: 1,
        title: 'Phase 1',
        description: 'First phase',
        tasks: [
          {
            task_id: unsafeCreateTaskId('task-1.1'),
            phase_id: unsafeCreatePhaseId('phase-1'),
            title: 'Task 1',
            description: 'First task',
            briefing_path: 'test',
            depends_on: [],
            status: 'pending',
          },
        ],
        status: 'in_progress',
      };

      expect(phase.tasks).toHaveLength(1);
    });

    it('should allow phase with summary', () => {
      const phase: MissionPhase = {
        phase_id: unsafeCreatePhaseId('phase-1'),
        mission_id: unsafeCreateMissionId('mission-20260129150000'),
        number: 1,
        title: 'Phase 1',
        description: 'First phase',
        tasks: [],
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        summary: {
          phase_id: unsafeCreatePhaseId('phase-1'),
          completed_at: new Date().toISOString(),
          tasks_completed: 3,
          tasks_failed: 0,
          tasks_skipped: 0,
          key_artifacts: ['src/auth/', 'src/middleware/auth.ts'],
          context_for_next: 'Authentication system complete with JWT tokens',
        },
      };

      expect(phase.summary?.tasks_completed).toBe(3);
      expect(phase.summary?.key_artifacts).toHaveLength(2);
    });
  });

  describe('Mission', () => {
    it('should allow valid Mission structure', () => {
      const mission: Mission = {
        mission_id: unsafeCreateMissionId('mission-20260129150000'),
        title: 'OAuth Implementation',
        description: 'Implement OAuth 2.0 authentication',
        planning: {
          stage: 'approved',
          iterations: 1,
          drafts: [],
          critiques: [],
        },
        phases: [],
        status: 'ready',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        stats: {
          total_phases: 0,
          total_tasks: 0,
          completed_tasks: 0,
          failed_tasks: 0,
        },
      };

      expect(mission.mission_id).toBeDefined();
      expect(mission.status).toBe('ready');
    });

    it('should allow all valid MissionStatus values', () => {
      const statuses: Array<Mission['status']> = [
        'planning',
        'plan_review',
        'ready',
        'in_progress',
        'completed',
        'failed',
        'cancelled',
      ];

      statuses.forEach(status => {
        const mission: Mission = {
          mission_id: unsafeCreateMissionId('mission-20260129150000'),
          title: 'Test',
          description: 'Test',
          planning: {
            stage: 'approved',
            iterations: 0,
            drafts: [],
            critiques: [],
          },
          phases: [],
          status,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          stats: {
            total_phases: 0,
            total_tasks: 0,
            completed_tasks: 0,
            failed_tasks: 0,
          },
        };
        expect(mission.status).toBe(status);
      });
    });

    it('should allow mission with plan drafts', () => {
      const mission: Mission = {
        mission_id: unsafeCreateMissionId('mission-20260129150000'),
        title: 'Test Mission',
        description: 'Test',
        planning: {
          stage: 'planner_v2',
          iterations: 2,
          drafts: [
            {
              version: 1,
              created_at: new Date().toISOString(),
              phases: [
                {
                  phase_id: unsafeCreatePhaseId('phase-1'),
                  mission_id: unsafeCreateMissionId('mission-20260129150000'),
                  number: 1,
                  title: 'Phase 1',
                  description: 'First phase',
                  tasks: [],
                },
              ],
            },
          ],
          critiques: [],
        },
        phases: [],
        status: 'planning',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        stats: {
          total_phases: 0,
          total_tasks: 0,
          completed_tasks: 0,
          failed_tasks: 0,
        },
      };

      expect(mission.planning.drafts).toHaveLength(1);
      expect(mission.planning.iterations).toBe(2);
    });
  });

  describe('Critique types', () => {
    it('should validate critique structure', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Phase 2 has duplicate tasks',
        items: [
          {
            id: 'critique-001',
            severity: 'major',
            category: 'duplicate_task',
            target: { type: 'task', id: 'task-2.1' },
            title: 'Task 2.1 and 2.3 are duplicates',
            description: 'Both tasks implement the same functionality',
          },
        ],
        stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
        rationale: 'Major issue requires revision',
      };

      expect(critique.verdict).toBe('needs_revision');
      expect(critique.items).toHaveLength(1);
      expect(critique.stats.major).toBe(1);
    });

    it('should allow all valid severity levels', () => {
      const severities: Array<Critique['items'][number]['severity']> = [
        'critical',
        'major',
        'minor',
        'suggestion',
      ];

      severities.forEach(severity => {
        const item = {
          id: 'critique-001',
          severity,
          category: 'other' as const,
          target: { type: 'mission' as const },
          title: 'Test',
          description: 'Test',
        };
        expect(item.severity).toBe(severity);
      });
    });

    it('should allow all valid categories', () => {
      const categories: Array<Critique['items'][number]['category']> = [
        'missing_task',
        'duplicate_task',
        'dependency_error',
        'scope_issue',
        'ordering_issue',
        'unclear_spec',
        'missing_artifact',
        'security_concern',
        'other',
      ];

      categories.forEach(category => {
        const item = {
          id: 'critique-001',
          severity: 'minor' as const,
          category,
          target: { type: 'mission' as const },
          title: 'Test',
          description: 'Test',
        };
        expect(item.category).toBe(category);
      });
    });

    it('should expose CRITIQUE_AUTO_APPROVE_THRESHOLD constant', () => {
      expect(CRITIQUE_AUTO_APPROVE_THRESHOLD.critical).toBe(0);
      expect(CRITIQUE_AUTO_APPROVE_THRESHOLD.major).toBe(0);
      expect(CRITIQUE_AUTO_APPROVE_THRESHOLD.minor).toBe(3);
    });
  });

  describe('CarryForward types', () => {
    it('should validate carry forward structure', () => {
      const cf: CarryForward = {
        task_id: unsafeCreateTaskId('task-1.1'),
        created_at: new Date().toISOString(),
        key_decisions: ['JWT authentication selected'],
        created_artifacts: ['src/auth/'],
        warnings: [],
      };

      expect(cf.key_decisions).toHaveLength(1);
      expect(cf.created_artifacts).toHaveLength(1);
    });

    it('should allow all optional fields', () => {
      const cf: CarryForward = {
        task_id: unsafeCreateTaskId('task-1.1'),
        created_at: new Date().toISOString(),
        key_decisions: ['Decision 1'],
        created_artifacts: ['file.ts'],
        warnings: ['Warning 1'],
        api_contracts: ['POST /api/login'],
        data_schemas: ['User { id, email }'],
        suggestions: ['Consider rate limiting'],
        dependencies_added: ['jsonwebtoken@9.0.0'],
        config_changes: ['Added JWT_SECRET to .env'],
      };

      expect(cf.api_contracts).toBeDefined();
      expect(cf.data_schemas).toBeDefined();
      expect(cf.suggestions).toBeDefined();
      expect(cf.dependencies_added).toBeDefined();
      expect(cf.config_changes).toBeDefined();
    });

    it('should validate PhaseContext structure', () => {
      const ctx: PhaseContext = {
        phase_id: unsafeCreatePhaseId('phase-1'),
        phase_number: 1,
        created_at: new Date().toISOString(),
        summary: 'Authentication phase completed',
        all_decisions: ['JWT selected', 'Redis for sessions'],
        all_artifacts: ['src/auth/', 'src/middleware/auth.ts'],
        all_api_contracts: ['POST /auth/login', 'GET /auth/refresh'],
        all_warnings: ['Rate limiting needed in Phase 2'],
        next_phase_context: 'Authentication complete, ready for authorization',
      };

      expect(ctx.phase_number).toBe(1);
      expect(ctx.all_decisions).toHaveLength(2);
    });

    it('should validate MissionGatekeeperVerdict structure', () => {
      const verdict: MissionGatekeeperVerdict = {
        verdict: 'PASS',
        reason: 'All tests passed, implementation complete',
        carry_forward: {
          task_id: unsafeCreateTaskId('task-1.1'),
          created_at: new Date().toISOString(),
          key_decisions: ['JWT authentication'],
          created_artifacts: ['src/auth/'],
          warnings: [],
        },
        suggestions: ['Consider adding rate limiting'],
      };

      expect(verdict.verdict).toBe('PASS');
      expect(verdict.carry_forward).toBeDefined();
      expect(verdict.carry_forward?.key_decisions).toHaveLength(1);
    });

    it('should allow verdict without carry_forward', () => {
      const verdict: MissionGatekeeperVerdict = {
        verdict: 'FAIL',
        reason: 'Tests failed',
        blocking_issues: ['TypeError in auth.ts:42'],
      };

      expect(verdict.verdict).toBe('FAIL');
      expect(verdict.carry_forward).toBeUndefined();
    });
  });
});
