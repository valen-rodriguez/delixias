import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  aud?: string;
}

export interface AuthUser {
  id_usuario: string;
  email: string;
}

@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(
  Strategy,
  'supabase-jwt',
) {
  private readonly logger = new Logger(SupabaseJwtStrategy.name);

  constructor(config: ConfigService) {
    const jwksUrl = config.get<string>('SUPABASE_JWKS_URL');

    if (!jwksUrl) {
      throw new Error(
        'SUPABASE_JWKS_URL is required. Set it in your .env file.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: jwksUrl,
      }),
      algorithms: ['RS256', 'ES256'],
      audience: 'authenticated',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload.sub) {
      this.logger.warn('JWT missing sub claim');
      throw new UnauthorizedException('Token de Supabase inválido');
    }

    if (payload.role === 'anon') {
      this.logger.warn(`Anonymous token rejected for sub: ${payload.sub}`);
      throw new UnauthorizedException('Token de Supabase inválido');
    }

    return {
      id_usuario: payload.sub,
      email: payload.email,
    };
  }
}
