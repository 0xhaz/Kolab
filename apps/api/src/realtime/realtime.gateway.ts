import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { SocketEvent, SocketPayload } from '@kolab/shared';
import { PrivyService } from '../auth/privy.service.js';
import { UsersService } from '../users/users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim());

/**
 * Pushes chain-confirmed events to the apps (techstacks §6.4). Every socket authenticates with
 * the same Privy access token as REST and joins `user:<id>`; campaign rooms need membership.
 */
@WebSocketGateway({ cors: { origin: corsOrigins, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly privy: PrivyService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token as string | undefined;
    try {
      if (!token) throw new Error('missing token');
      const user = await this.users.findOrCreate(await this.privy.verify(token));
      socket.data.userId = user.id;
      await socket.join(`user:${user.id}`);
    } catch {
      socket.emit('error', { code: 'unauthorized' });
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe:campaign')
  async subscribeCampaign(@ConnectedSocket() socket: Socket, @MessageBody() campaignId: string) {
    const userId = socket.data.userId as string | undefined;
    if (!userId || typeof campaignId !== 'string') return { ok: false };
    const member = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        OR: [{ brandId: userId }, { enrollments: { some: { creatorId: userId } } }],
      },
      select: { id: true },
    });
    if (!member) return { ok: false };
    await socket.join(`campaign:${campaignId}`);
    return { ok: true };
  }

  emit<T>(rooms: string[], event: SocketEvent, data: T, txSignature?: string) {
    if (!this.server || rooms.length === 0) return;
    const payload: SocketPayload<T> = { event, data, txSignature, at: new Date().toISOString() };
    this.server.to(rooms).emit(event, payload);
  }
}
