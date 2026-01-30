import { describe, it, expect } from 'vitest';
import {
  createMissionCreatedEvent,
  createPlanningStageStartedEvent,
  createPlanningStageCompletedEvent,
  createPlanApprovedEvent,
  createMissionPhaseStartedEvent,
  createMissionPhaseCompletedEvent,
  createMissionTaskUpdateEvent,
  createMissionCompletedEvent,
  isMissionEvent,
  isPlanningEvent,
  createRunStartedEvent,
  MissionEventTypes,
  type MissionCreatedEvent,
  type PlanningStageStartedEvent,
  type PlanningStageCompletedEvent,
  type PlanApprovedEvent,
  type MissionPhaseStartedEvent,
  type MissionPhaseCompletedEvent,
  type MissionTaskUpdateEvent,
  type MissionCompletedEvent,
} from '../../../src/types/events.js';
import {
  unsafeCreateMissionId,
  unsafeCreatePhaseId,
  unsafeCreateTaskId,
  unsafeCreateRunId,
} from '../../../src/types/branded.js';

describe('Mission Events', () => {
  describe('Event type constants', () => {
    it('should expose MissionEventTypes constants', () => {
      expect(MissionEventTypes.MISSION_CREATED).toBe('mission_created');
      expect(MissionEventTypes.PLANNING_STAGE_STARTED).toBe('planning_stage_started');
      expect(MissionEventTypes.PLANNING_STAGE_COMPLETED).toBe('planning_stage_completed');
      expect(MissionEventTypes.PLAN_APPROVED).toBe('plan_approved');
      expect(MissionEventTypes.MISSION_PHASE_STARTED).toBe('mission_phase_started');
      expect(MissionEventTypes.MISSION_PHASE_COMPLETED).toBe('mission_phase_completed');
      expect(MissionEventTypes.MISSION_TASK_UPDATE).toBe('mission_task_update');
      expect(MissionEventTypes.MISSION_COMPLETED).toBe('mission_completed');
    });
  });

  describe('createMissionCreatedEvent', () => {
    it('should create valid event with timestamp', () => {
      const missionId = unsafeCreateMissionId('mission-20260129150000');
      const event = createMissionCreatedEvent(missionId, 'OAuth Implementation');

      expect(event.type).toBe('mission_created');
      expect(event.missionId).toBe('mission-20260129150000');
      expect(event.title).toBe('OAuth Implementation');
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.runId).toBeDefined();
    });

    it('should have correct type structure', () => {
      const event: MissionCreatedEvent = createMissionCreatedEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        'Test Mission'
      );

      expect(event.type).toBe('mission_created');
    });
  });

  describe('createPlanningStageStartedEvent', () => {
    it('should create valid event for planner', () => {
      const missionId = unsafeCreateMissionId('mission-20260129150000');
      const event = createPlanningStageStartedEvent(missionId, 'planner', 1);

      expect(event.type).toBe('planning_stage_started');
      expect(event.missionId).toBe('mission-20260129150000');
      expect(event.stage).toBe('planner');
      expect(event.iteration).toBe(1);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should create valid event for critic', () => {
      const missionId = unsafeCreateMissionId('mission-20260129150000');
      const event = createPlanningStageStartedEvent(missionId, 'critic', 2);

      expect(event.stage).toBe('critic');
      expect(event.iteration).toBe(2);
    });

    it('should have correct type structure', () => {
      const event: PlanningStageStartedEvent = createPlanningStageStartedEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        'planner',
        1
      );

      expect(event.type).toBe('planning_stage_started');
    });
  });

  describe('createPlanningStageCompletedEvent', () => {
    it('should create valid event with all result types', () => {
      const missionId = unsafeCreateMissionId('mission-20260129150000');

      const successEvent = createPlanningStageCompletedEvent(missionId, 'planner', 1, 'success');
      expect(successEvent.result).toBe('success');

      const revisionEvent = createPlanningStageCompletedEvent(missionId, 'critic', 1, 'needs_revision');
      expect(revisionEvent.result).toBe('needs_revision');

      const humanEvent = createPlanningStageCompletedEvent(missionId, 'critic', 2, 'needs_human');
      expect(humanEvent.result).toBe('needs_human');
    });

    it('should have correct type structure', () => {
      const event: PlanningStageCompletedEvent = createPlanningStageCompletedEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        'critic',
        1,
        'success'
      );

      expect(event.type).toBe('planning_stage_completed');
    });
  });

  describe('createPlanApprovedEvent', () => {
    it('should create valid event with auto approval', () => {
      const missionId = unsafeCreateMissionId('mission-20260129150000');
      const event = createPlanApprovedEvent(missionId, 3, 12, 'auto');

      expect(event.type).toBe('plan_approved');
      expect(event.totalPhases).toBe(3);
      expect(event.totalTasks).toBe(12);
      expect(event.approvedBy).toBe('auto');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should create valid event with human approval', () => {
      const event = createPlanApprovedEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        2,
        5,
        'human'
      );

      expect(event.approvedBy).toBe('human');
    });

    it('should have correct type structure', () => {
      const event: PlanApprovedEvent = createPlanApprovedEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        3,
        10,
        'auto'
      );

      expect(event.type).toBe('plan_approved');
    });
  });

  describe('createMissionPhaseStartedEvent', () => {
    it('should create valid event', () => {
      const missionId = unsafeCreateMissionId('mission-20260129150000');
      const phaseId = unsafeCreatePhaseId('phase-1');
      const event = createMissionPhaseStartedEvent(missionId, phaseId, 1);

      expect(event.type).toBe('mission_phase_started');
      expect(event.missionId).toBe('mission-20260129150000');
      expect(event.phaseId).toBe('phase-1');
      expect(event.phaseNumber).toBe(1);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should have correct type structure', () => {
      const event: MissionPhaseStartedEvent = createMissionPhaseStartedEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        unsafeCreatePhaseId('phase-1'),
        1
      );

      expect(event.type).toBe('mission_phase_started');
    });
  });

  describe('createMissionPhaseCompletedEvent', () => {
    it('should create valid event with task counts', () => {
      const missionId = unsafeCreateMissionId('mission-20260129150000');
      const phaseId = unsafeCreatePhaseId('phase-1');
      const event = createMissionPhaseCompletedEvent(missionId, phaseId, 1, 8, 2);

      expect(event.type).toBe('mission_phase_completed');
      expect(event.phaseNumber).toBe(1);
      expect(event.tasksCompleted).toBe(8);
      expect(event.tasksFailed).toBe(2);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should have correct type structure', () => {
      const event: MissionPhaseCompletedEvent = createMissionPhaseCompletedEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        unsafeCreatePhaseId('phase-1'),
        1,
        5,
        0
      );

      expect(event.type).toBe('mission_phase_completed');
    });
  });

  describe('createMissionTaskUpdateEvent', () => {
    it('should create valid event with status change', () => {
      const missionId = unsafeCreateMissionId('mission-20260129150000');
      const taskId = unsafeCreateTaskId('task-1.1');
      const event = createMissionTaskUpdateEvent(missionId, taskId, 'pending', 'in_progress');

      expect(event.type).toBe('mission_task_update');
      expect(event.taskId).toBe('task-1.1');
      expect(event.previousStatus).toBe('pending');
      expect(event.newStatus).toBe('in_progress');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should allow optional taskRunId', () => {
      const event = createMissionTaskUpdateEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        unsafeCreateTaskId('task-1.1'),
        'in_progress',
        'passed',
        'run-20260129160000'
      );

      expect(event.taskRunId).toBe('run-20260129160000');
    });

    it('should have correct type structure', () => {
      const event: MissionTaskUpdateEvent = createMissionTaskUpdateEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        unsafeCreateTaskId('task-1.1'),
        'pending',
        'in_progress'
      );

      expect(event.type).toBe('mission_task_update');
    });
  });

  describe('createMissionCompletedEvent', () => {
    it('should create valid event for completed mission', () => {
      const missionId = unsafeCreateMissionId('mission-20260129150000');
      const stats = {
        total_phases: 3,
        total_tasks: 12,
        completed_tasks: 12,
        failed_tasks: 0,
      };
      const event = createMissionCompletedEvent(missionId, 'completed', stats);

      expect(event.type).toBe('mission_completed');
      expect(event.status).toBe('completed');
      expect(event.stats.total_phases).toBe(3);
      expect(event.stats.completed_tasks).toBe(12);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should create valid event for failed mission', () => {
      const stats = {
        total_phases: 2,
        total_tasks: 8,
        completed_tasks: 5,
        failed_tasks: 3,
      };
      const event = createMissionCompletedEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        'failed',
        stats
      );

      expect(event.status).toBe('failed');
      expect(event.stats.failed_tasks).toBe(3);
    });

    it('should create valid event for cancelled mission', () => {
      const stats = {
        total_phases: 1,
        total_tasks: 4,
        completed_tasks: 2,
        failed_tasks: 0,
      };
      const event = createMissionCompletedEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        'cancelled',
        stats
      );

      expect(event.status).toBe('cancelled');
    });

    it('should have correct type structure', () => {
      const event: MissionCompletedEvent = createMissionCompletedEvent(
        unsafeCreateMissionId('mission-20260129150000'),
        'completed',
        {
          total_phases: 1,
          total_tasks: 3,
          completed_tasks: 3,
          failed_tasks: 0,
        }
      );

      expect(event.type).toBe('mission_completed');
    });
  });

  describe('Type guards', () => {
    describe('isMissionEvent', () => {
      it('should return true for mission_created event', () => {
        const event = createMissionCreatedEvent(
          unsafeCreateMissionId('mission-20260129150000'),
          'Test'
        );
        expect(isMissionEvent(event)).toBe(true);
      });

      it('should return true for mission_phase_started event', () => {
        const event = createMissionPhaseStartedEvent(
          unsafeCreateMissionId('mission-20260129150000'),
          unsafeCreatePhaseId('phase-1'),
          1
        );
        expect(isMissionEvent(event)).toBe(true);
      });

      it('should return true for planning events', () => {
        const event = createPlanningStageStartedEvent(
          unsafeCreateMissionId('mission-20260129150000'),
          'planner',
          1
        );
        expect(isMissionEvent(event)).toBe(true);
      });

      it('should return true for plan_approved event', () => {
        const event = createPlanApprovedEvent(
          unsafeCreateMissionId('mission-20260129150000'),
          2,
          5,
          'auto'
        );
        expect(isMissionEvent(event)).toBe(true);
      });

      it('should return false for run events', () => {
        const event = createRunStartedEvent(unsafeCreateRunId('run-20260129150000'));
        expect(isMissionEvent(event)).toBe(false);
      });
    });

    describe('isPlanningEvent', () => {
      it('should return true for planning_stage_started event', () => {
        const event = createPlanningStageStartedEvent(
          unsafeCreateMissionId('mission-20260129150000'),
          'planner',
          1
        );
        expect(isPlanningEvent(event)).toBe(true);
      });

      it('should return true for planning_stage_completed event', () => {
        const event = createPlanningStageCompletedEvent(
          unsafeCreateMissionId('mission-20260129150000'),
          'critic',
          1,
          'success'
        );
        expect(isPlanningEvent(event)).toBe(true);
      });

      it('should return true for plan_approved event', () => {
        const event = createPlanApprovedEvent(
          unsafeCreateMissionId('mission-20260129150000'),
          2,
          5,
          'auto'
        );
        expect(isPlanningEvent(event)).toBe(true);
      });

      it('should return false for mission_phase_started event', () => {
        const event = createMissionPhaseStartedEvent(
          unsafeCreateMissionId('mission-20260129150000'),
          unsafeCreatePhaseId('phase-1'),
          1
        );
        expect(isPlanningEvent(event)).toBe(false);
      });

      it('should return false for run events', () => {
        const event = createRunStartedEvent(unsafeCreateRunId('run-20260129150000'));
        expect(isPlanningEvent(event)).toBe(false);
      });
    });
  });
});
