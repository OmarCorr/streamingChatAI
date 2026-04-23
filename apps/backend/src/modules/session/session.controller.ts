import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { SessionGuard } from '../../common/guards/session.guard';
import { CreateSessionResponseDto } from './dto/create-session-response.dto';

@ApiTags('sessions')
@Controller('sessions')
@SkipThrottle()
export class SessionController {
  @Post()
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Create or retrieve an anonymous session' })
  createSession(@Req() req: Request): CreateSessionResponseDto {
    return { sessionId: req.sessionId ?? '' };
  }
}
