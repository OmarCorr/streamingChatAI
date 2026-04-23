import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationOwnerGuard } from '../../common/guards/conversation-owner.guard';

@Module({
  controllers: [ConversationController],
  providers: [ConversationService, ConversationOwnerGuard],
  exports: [ConversationService],
})
export class ConversationModule {}
