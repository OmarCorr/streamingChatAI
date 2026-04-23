import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { SessionGuard } from '../../common/guards/session.guard';

@Module({
  controllers: [SessionController],
  providers: [SessionService, SessionGuard],
  exports: [SessionService, SessionGuard],
})
export class SessionModule {}
