import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { SessionGuard } from '../../common/guards/session.guard';
import { ConversationOwnerGuard } from '../../common/guards/conversation-owner.guard';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { RenameConversationDto } from './dto/rename-conversation.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { Conversation } from '@streaming-chat/database';

function toDto(conv: Conversation): ConversationResponseDto {
  return { id: conv.id, title: conv.title, createdAt: conv.createdAt, updatedAt: conv.updatedAt };
}

@ApiTags('conversations')
@Controller('conversations')
@UseGuards(SessionGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new conversation' })
  async create(
    @Req() req: Request,
    @Body() _dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    const conv = await this.conversationService.create(req.sessionId ?? '');
    return toDto(conv);
  }

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'List all conversations for this session' })
  async findAll(@Req() req: Request): Promise<ConversationResponseDto[]> {
    const convs = await this.conversationService.findAll(req.sessionId ?? '');
    return convs.map(toDto);
  }

  @Get(':id')
  @SkipThrottle()
  @UseGuards(ConversationOwnerGuard)
  @ApiOperation({ summary: 'Get a conversation by id' })
  async findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ConversationResponseDto> {
    const conv = await this.conversationService.findOwned(id, req.sessionId ?? '');
    if (!conv) throw new NotFoundException();
    return toDto(conv);
  }

  @Patch(':id')
  @UseGuards(ConversationOwnerGuard)
  @ApiOperation({ summary: 'Rename a conversation' })
  async rename(
    @Param('id') id: string,
    @Body() dto: RenameConversationDto,
  ): Promise<ConversationResponseDto> {
    const conv = await this.conversationService.rename(id, dto.title);
    return toDto(conv);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ConversationOwnerGuard)
  @ApiOperation({ summary: 'Delete a conversation and all its messages' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.conversationService.remove(id);
  }
}
