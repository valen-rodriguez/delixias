import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SupabaseJwtStrategy } from './strategies/supabase-jwt.strategy.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'supabase-jwt' })],
  providers: [SupabaseJwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
