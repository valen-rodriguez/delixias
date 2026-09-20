import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SupabaseJwtStrategy } from './strategies/supabase-jwt.strategy.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'supabase-jwt' })],
  providers: [SupabaseJwtStrategy, WsJwtGuard],
  exports: [PassportModule, WsJwtGuard],
})
export class AuthModule {}
