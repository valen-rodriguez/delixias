import type { RolOperativo, VendorStatusBanner } from '@/types/auth';

export type ParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  Home: {
    rol: RolOperativo;
    modoForzado?: boolean;
    vendorStatusBanner?: VendorStatusBanner | null;
  };
  EmailVerification: undefined;
};
