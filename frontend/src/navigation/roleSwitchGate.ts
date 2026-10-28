import type { SanitizedProfile } from '@/types/auth';

export type SwitchAction =
  | 'enterVendor'
  | 'openOnboarding'
  | 'showSuspendedModal'
  | 'showPendingReviewAlert'
  | 'showBlockedState';

export const resolveSwitchAction = (profile: SanitizedProfile): SwitchAction => {
  switch (profile.estado_vendedor) {
    case 'activo':
      return 'enterVendor';
    case 'no_solicitado':
      return 'openOnboarding';
    case 'suspendido':
      return 'showSuspendedModal';
    case 'pendiente_revision':
      return 'showPendingReviewAlert';
    case 'bloqueado':
      return 'showBlockedState';
  }
};
