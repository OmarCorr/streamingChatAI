import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionResponseDto {
  @ApiProperty({ description: 'The session ID' })
  sessionId!: string;
}
