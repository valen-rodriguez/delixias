import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, Inject } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { Pool } from 'pg';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard.js';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/geo',
})
export class GeolocationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GeolocationGateway.name);

  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    private readonly wsJwtGuard: WsJwtGuard,
  ) {}

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: Socket) {
    const valid = await this.wsJwtGuard.validateHandshake(client);
    if (!valid) {
      this.logger.warn(`Unauthorized WS connection attempt from ${client.id}, disconnecting`);
      client.emit('auth_error', { message: 'Unauthorized' });
      client.disconnect(true);
      return;
    }
    this.logger.debug(`Client connected: ${client.id}, user: ${client.data.user?.id_usuario}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:vendor-position')
  async handleSubscribeVendorPosition(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { id_jornada: string },
  ) {
    const idUsuario = client.data.user?.id_usuario;
    if (!idUsuario) {
      return;
    }

    // Security: Check if client is allowed to subscribe to this jornada
    // They are allowed if:
    // 1. They are the vendor of the jornada OR
    // 2. They are a client with a pending/active order for this vendor

    const result = await this.pool.query(
      `
      SELECT 1 FROM public.jornadas j
      WHERE j.id_jornada = $1 AND j.id_vendedor = $2
      UNION ALL
      SELECT 1 FROM public.pedidos p
      WHERE p.id_jornada = $1 AND p.id_cliente = $2 AND p.estado IN ('solicitado', 'en_curso')
      `,
      [data.id_jornada, idUsuario]
    );

    if ((result.rowCount ?? 0) === 0) {
      this.logger.warn(`Client ${idUsuario} unauthorized to subscribe to jornada ${data.id_jornada}`);
      return;
    }

    const room = `geo:vendedores:${data.id_jornada}`;
    client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);
  }

  broadcastVendorPosition(
    idJornada: string,
    payload: {
      id_vendedor: string;
      coordenadas: { lat: number; lng: number };
      timestamp: string;
    },
  ) {
    const room = `geo:vendedores:${idJornada}`;
    this.server?.to(room).emit('vendedor:posicion', payload);
  }

  broadcastLocationRevoked(
    idPedido: string,
    motivo: 'completado' | 'cancelado' | 'rechazado',
  ) {
    this.server?.emit('orden:ubicacion-revocada:pedido:' + idPedido, {
      id_pedido: idPedido,
      motivo,
    });
  }
}
