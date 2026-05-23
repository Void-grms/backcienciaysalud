import { Module } from '@nestjs/common';

import { EmailTemplateService } from './email-template.service';
import { MailService } from './mail.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsSubscriber } from './notifications.subscriber';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, MailService, EmailTemplateService, NotificationsSubscriber],
  exports: [NotificationsService],
})
export class NotificationsModule {}
