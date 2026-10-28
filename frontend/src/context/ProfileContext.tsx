import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { getProfile } from '@/services/usersService';
import { deriveShellState } from '@/navigation/shellDerivation';
import type { SanitizedProfile, VendorStatusBanner } from '@/types/auth';

interface ProfileContextValue {
  profile: SanitizedProfile | null;
  banner: VendorStatusBanner;
  setProfile: (profile: SanitizedProfile) => void;
  clearProfile: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export const ProfileProvider = ({ children }: { children: ReactNode }) => {
  const [profile, setProfileState] = useState<SanitizedProfile | null>(null);
  const [banner, setBanner] = useState<VendorStatusBanner>(null);
  const profileRef = useRef<SanitizedProfile | null>(null);

  const applyProfile = useCallback((next: SanitizedProfile | null) => {
    profileRef.current = next;
    setProfileState(next);
    setBanner(next ? deriveShellState(next).banner : null);
  }, []);

  const setProfile = useCallback(
    (next: SanitizedProfile) => {
      applyProfile(next);
    },
    [applyProfile],
  );

  const clearProfile = useCallback(() => {
    applyProfile(null);
  }, [applyProfile]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !profileRef.current) {
        return;
      }
      void (async () => {
        try {
          const fresh = await getProfile();
          applyProfile(fresh);
        } catch {
          return;
        }
      })();
    });
    return () => {
      subscription.remove();
    };
  }, [applyProfile]);

  const value = useMemo<ProfileContextValue>(
    () => ({ profile, banner, setProfile, clearProfile }),
    [profile, banner, setProfile, clearProfile],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

export const useProfile = (): ProfileContextValue => {
  const value = useContext(ProfileContext);
  if (!value) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return value;
};
