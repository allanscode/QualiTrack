import { AuditingQueueType } from '../types';
import { canManageQueueAssignments, isDistributedQueue, QueueAssignment } from './queueDistribution';

/** Pure, read-only predicate. Filtering must never invoke assignment RPCs. */
export function matchesAssignedMonitor(
  queueType: AuditingQueueType,
  role: string | undefined,
  selectedMonitorId: string,
  ticketId: string,
  assignments: Record<string, QueueAssignment>,
  assignmentsReady: boolean,
): boolean {
  if (!selectedMonitorId || !canManageQueueAssignments(role) || !isDistributedQueue(queueType)) return true;
  return assignmentsReady && assignments[ticketId]?.assigned_to === selectedMonitorId;
}
