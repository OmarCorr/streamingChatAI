import { Injectable } from '@nestjs/common';
import { Session } from '@streaming-chat/database';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(params: { ipHash: string; userAgent: string | null }): Promise<Session> {
    return this.prisma.session.create({
      data: {
        ipHash: params.ipHash,
        userAgent: params.userAgent,
      },
    });
  }

  async findSession(id: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { id } });
  }

  async touchSession(id: string): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: {},  // @updatedAt on lastActiveAt handles the timestamp automatically
    });
  }
}
