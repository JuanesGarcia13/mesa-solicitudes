import { describe, expect, it } from 'vitest';
import {
  ActionNotAllowedError,
  InvalidTransitionError,
  RequestClosedError,
  ValidationError,
} from '../../src/domain/errors.js';
import { INITIAL_STATUS, REQUEST_STATUSES } from '../../src/domain/request-status.js';
import {
  WORKFLOW_ACTIONS,
  allowedActions,
  planTransition,
} from '../../src/domain/request-workflow.js';

describe('request workflow', () => {
  it('starts every new request in the first stage of the process', () => {
    expect(INITIAL_STATUS).toBe('REGISTERED');
  });

  describe('happy path follows the agreed process', () => {
    it('analyst starts attention: REGISTERED -> IN_PROGRESS', () => {
      expect(planTransition('REGISTERED', 'START', 'ANALYST').to).toBe('IN_PROGRESS');
    });

    it('analyst resolves with a comment: IN_PROGRESS -> RESOLVED', () => {
      const t = planTransition('IN_PROGRESS', 'RESOLVE', 'ANALYST', '  Pago aplicado  ');
      expect(t).toEqual({ action: 'RESOLVE', from: 'IN_PROGRESS', to: 'RESOLVED', comment: 'Pago aplicado' });
    });

    it('requester confirms the solution and the request closes: RESOLVED -> CLOSED', () => {
      expect(planTransition('RESOLVED', 'CONFIRM', 'REQUESTER').to).toBe('CLOSED');
    });

    it('requester not satisfied sends it back to attention: RESOLVED -> IN_PROGRESS', () => {
      expect(planTransition('RESOLVED', 'REJECT', 'REQUESTER', 'Sigue fallando').to).toBe('IN_PROGRESS');
    });
  });

  describe('a request only advances to the next stage', () => {
    const validPairs = new Set(['REGISTERED:START', 'IN_PROGRESS:RESOLVE', 'RESOLVED:CONFIRM', 'RESOLVED:REJECT']);
    const invalid = REQUEST_STATUSES.filter((s) => s !== 'CLOSED').flatMap((status) =>
      WORKFLOW_ACTIONS.filter((action) => !validPairs.has(`${status}:${action}`)).map(
        (action) => [status, action] as const,
      ),
    );

    it.each(invalid)('rejects %s + %s with an explanation', (status, action) => {
      const role = action === 'START' || action === 'RESOLVE' ? 'ANALYST' : 'REQUESTER';
      expect(() => planTransition(status, action, role, 'comentario')).toThrow(InvalidTransitionError);
    });

    it('explains the current state and the allowed next step', () => {
      expect(() => planTransition('REGISTERED', 'RESOLVE', 'ANALYST', 'x')).toThrow(
        /estado "Registrada".*Siguiente paso: el analista puede iniciar la atención/,
      );
    });
  });

  describe('only the subsidiary confirms or rejects the solution', () => {
    it('analyst cannot confirm', () => {
      expect(() => planTransition('RESOLVED', 'CONFIRM', 'ANALYST')).toThrow(ActionNotAllowedError);
      expect(() => planTransition('RESOLVED', 'CONFIRM', 'ANALYST')).toThrow(
        'Solo la filial puede confirmar la solución de una solicitud.',
      );
    });

    it('analyst cannot reject', () => {
      expect(() => planTransition('RESOLVED', 'REJECT', 'ANALYST', 'x')).toThrow(ActionNotAllowedError);
    });

    it('requester cannot start or resolve its own request', () => {
      expect(() => planTransition('REGISTERED', 'START', 'REQUESTER')).toThrow(ActionNotAllowedError);
      expect(() => planTransition('IN_PROGRESS', 'RESOLVE', 'REQUESTER', 'x')).toThrow(ActionNotAllowedError);
    });
  });

  describe('a closed request accepts no changes', () => {
    it.each(WORKFLOW_ACTIONS)('rejects %s on CLOSED', (action) => {
      expect(() => planTransition('CLOSED', action, 'ANALYST', 'x')).toThrow(RequestClosedError);
      expect(() => planTransition('CLOSED', action, 'REQUESTER', 'x')).toThrow(
        'La solicitud está cerrada y no admite cambios.',
      );
    });
  });

  describe('comments', () => {
    it('requires a resolution comment', () => {
      expect(() => planTransition('IN_PROGRESS', 'RESOLVE', 'ANALYST', '   ')).toThrow(ValidationError);
    });

    it('requires a reason to reject the solution', () => {
      expect(() => planTransition('RESOLVED', 'REJECT', 'REQUESTER')).toThrow(ValidationError);
    });
  });

  describe('allowedActions', () => {
    it('exposes what each role can do next', () => {
      expect(allowedActions('REGISTERED', 'ANALYST')).toEqual(['START']);
      expect(allowedActions('REGISTERED', 'REQUESTER')).toEqual([]);
      expect(allowedActions('RESOLVED', 'REQUESTER')).toEqual(['CONFIRM', 'REJECT']);
      expect(allowedActions('CLOSED', 'ANALYST')).toEqual([]);
    });
  });
});
