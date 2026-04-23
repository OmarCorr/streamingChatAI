import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ maxLength: 4000, description: 'Message content (PRD RF-36)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}
