import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { AppConfiguration } from '../../config/configuration.js';
import type { JwtPayload } from '../strategies/supabase-jwt.strategy.js';

@Injectable()
export class WsJwtGuard {
  private readonly logger = new Logger(WsJwtGuard.name);
  private readonly secretProvider: ReturnType<typeof passportJwtSecret>;

  constructor(config: ConfigService<AppConfiguration>) {
    const jwksUrl = config.get('supabaseJwksUrl');
    if (!jwksUrl) {
      throw new Error('SUPABASE_JWKS_URL is required for WebSocket authentication.');
    }
    this.secretProvider = passportJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: jwksUrl,
    });
  }

  async validateHandshake(client: Socket): Promise<boolean> {
    const token = this.extractToken(client);
    if (!token) return false;

    try {
      const payload = await new Promise<JwtPayload>((resolve, reject) => {
        this.secretProvider({}, {}, (error: unknown, secret?: jwt.Secret) => {
          if (error || !secret) {
            reject(error ?? new Error('JWKS key unavailable'));
            return;
          }
          jwt.verify(token, secret, {
            algorithms: ['RS256', 'ES256'],
            audience: 'authenticated',
          }, (verifyError, decoded) => {
            if (verifyError || !decoded || typeof decoded === 'string') {
              reject(verifyError ?? new Error('Invalid JWT'));
              return;
            }
            resolve(decoded as JwtPayload);
          });
        });
      });

      if (!payload.sub || payload.role === 'anon') return false;

      client.data.user = { id_usuario: payload.sub, email: payload.email };
      return true;
    } catch (error) {
      this.logger.warn(`WebSocket JWT validation failed: ${error}`);
      return false;
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    const header = client.handshake.headers.authorization;
    const token = typeof authToken === 'string'
      ? authToken
      : typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7)
        : null;
    return token?.trim() || null;
  }
}
