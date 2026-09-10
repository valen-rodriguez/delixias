import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SupabaseJwtAuthGuard extends AuthGuard('supabase-jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
