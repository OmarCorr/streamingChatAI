import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { SessionGuard } from '../../common/guards/session.guard';
import { ConversationOwnerGuard } from '../../common/guards/conversation-owner.guard';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

interface MessageEvent {
  type: string;
  data: Record<string, unknown>;
}

@ApiTags('chat')
@Controller('conversations')
@UseGuards(SessionGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post(':id/messages')
  @Sse()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ConversationOwnerGuard)
  @ApiOperation({ summary: 'Send a message and stream the assistant response via SSE' })
  async streamMessage(
    @Req() req: Request,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ): Promise<Observable<MessageEvent>> {
    return this.chatService.streamMessage(req, conversationId, dto);
  }

  @Post(':id/messages/:mid/regenerate')
  @Sse()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ConversationOwnerGuard)
  @ApiOperation({ summary: 'Regenerate an assistant message via SSE' })
  async regenerateMessage(
    @Req() req: Request,
    @Param('id') conversationId: string,
    @Param('mid') messageId: string,
  ): Promise<Observable<MessageEvent>> {
    return this.chatService.regenerateMessage(req, conversationId, messageId);
  }
}
