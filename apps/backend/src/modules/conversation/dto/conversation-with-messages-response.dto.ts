import { ApiProperty } from '@nestjs/swagger';
import { ConversationResponseDto } from './conversation-response.dto';
import { MessageResponseDto } from './message-response.dto';

export class ConversationWithMessagesResponseDto extends ConversationResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  messages!: MessageResponseDto[];
}
