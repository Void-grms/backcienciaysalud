// Catalogo de nombres de eventos. Centralizado para evitar typos al
// emitir/escuchar; lo importan tanto el emisor (OrdersService) como los
// suscriptores (NotificationsSubscriber).

export const AppEvents = {
  OrderDelivered: 'order.delivered',
  PasswordResetRequested: 'auth.password-reset-requested',
  UserCredentialsIssued: 'users.credentials-issued',
  // Evento generico de auditoria: cualquier servicio que muta estado critico
  // lo emite y un suscriptor (AuditSubscriber) lo persiste en audit_log.
  AuditEvent: 'audit.event',
} as const;

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorRole?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface OrderDeliveredEvent {
  orderId: string;
  actorUserId: string | null;
}

export interface PasswordResetRequestedEvent {
  userId: string;
  email: string;
  token: string;
}

export interface UserCredentialsIssuedEvent {
  userId: string;
  recipientEmail: string;
  identifier: string;
  fullName: string | null;
  temporaryPassword: string;
}
