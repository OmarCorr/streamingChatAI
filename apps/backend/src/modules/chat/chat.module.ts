import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationModule } from '../conversation/conversation.module';
import { ConversationOwnerGuard } from '../../common/guards/conversation-owner.guard';

@Module({
  imports: [ConversationModule],
  controllers: [ChatController],
  providers: [ChatService, ConversationOwnerGuard],
})
export class ChatModule {}
