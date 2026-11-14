import { db, auditLog } from '@workspace/db';
import { nowEpochMs } from '../../lib/time.js';

export type AuditAction =
  | 'GUARDIAN_VIEWED_LINK'
  | 'SOS_CREATED'
  | 'SOS_ACKNOWLEDGED'
  | 'SOS_CANCELLED'
  | 'DATA_DELETED'
  | 'WATCH_STARTED'
  | 'TRIP_STARTED'
  | 'TRIP_ENDED'
  | 'RELAY_PACKET_ACCEPTED'
  | 'RELAY_PACKET_DUPLICATE'
  | 'RELAY_PACKET_INVALID_SIGNATURE'
  | 'RELAY_PACKET_UNKNOWN_SENDER'
  | 'RELAY_PACKET_EXPIRED'
  | 'RELAY_PACKET_DESTINATION_MISMATCH'
  | 'RELAY_PACKET_PROCESSING_FAILED'
  | 'RELAY_PACKET_OVERSIZE'
  | 'RELAY_PACKET_INVALID_BASE64'
  | 'RELAY_PACKET_NON_CANONICAL'
  | 'RELAY_PACKET_PARSE_FAILED'
  | 'RELAY_PACKET_INVALID_FORMAT'
  | 'RELAY_PACKET_DECRYPTION_FAILED'
  | 'RELAY_PACKET_SIGNATURE_FAILED'
  | 'RELAY_PACKET_RETRY_SCHEDULED'
  | 'RELAY_PACKET_EXHAUSTED'
  | 'RELAY_BATCH_OVERSIZE'
  | 'RELAY_SOS_CREATED';

/**
 * Service for Append-only Audit Log (TRD 8.6, Table audit_log)
 * Records key privacy, access, and emergency events.
 */
export class AuditService {
  /**
   * Record an immutable audit log entry
   */
  async record(actor: string, action: AuditAction, resource: string): Promise<void> {
    try {
      await db.insert(auditLog).values({
        actor,
        action,
        resource,
        ts: nowEpochMs(),
      });
    } catch (err) {
      // Non-blocking failure, log error but do not break main execution
      console.error('[AuditService] Failed to record audit log:', err);
    }
  }
}

export const auditService = new AuditService();

