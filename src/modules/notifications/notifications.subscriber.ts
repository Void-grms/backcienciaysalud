import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  AppEvents,
  OrderDeliveredEvent,
  PasswordResetRequestedEvent,
  UserCredentialsIssuedEvent,
} from '@shared/events/app-events';

import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsSubscriber {
  private readonly logger = new Logger(NotificationsSubscriber.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(AppEvents.OrderDelivered, { async: true })
  async onOrderDelivered(event: OrderDeliveredEvent): Promise<void> {
    try {
      await this.notifications.notifyOrderDelivered(event.orderId);
    } catch (err) {
      this.logger.error(
        `Fallo al notificar entrega de orden ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(AppEvents.PasswordResetRequested, { async: true })
  async onPasswordReset(event: PasswordResetRequestedEvent): Promise<void> {
    try {
      await this.notifications.sendPasswordReset(event.email, event.token);
    } catch (err) {
      this.logger.error(
        `Fallo al enviar reset a ${event.email}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(AppEvents.UserCredentialsIssued, { async: true })
  async onCredentialsIssued(event: UserCredentialsIssuedEvent): Promise<void> {
    try {
      await this.notifications.sendCredentials({
        recipientEmail: event.recipientEmail,
        identifier: event.identifier,
        fullName: event.fullName,
        temporaryPassword: event.temporaryPassword,
      });
    } catch (err) {
      this.logger.error(
        `Fallo al enviar credenciales a ${event.recipientEmail}: ${(err as Error).message}`,
      );
    }
  }
}
