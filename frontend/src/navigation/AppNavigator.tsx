import { createStackNavigator } from '@react-navigation/stack';
import { SplashScreen } from '@/screens/SplashScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { EmailVerificationScreen } from '@/screens/EmailVerificationScreen';
import { HomeClienteScreen } from '@/screens/HomeClienteScreen';
import { UpgradeToSellerScreen } from '@/screens/UpgradeToSellerScreen';
import { ReappealScreen } from '@/screens/ReappealScreen';
import { VendorTabNavigator } from '@/navigation/VendorTabNavigator';
import { useProfile } from '@/context/ProfileContext';
import { deriveShellState } from '@/navigation/shellDerivation';
import type { ParamList } from './types';

const Stack = createStackNavigator<ParamList>();

export const AppNavigator = () => {
  const { profile } = useProfile();
  const shell = profile ? deriveShellState(profile) : null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {shell && profile ? (
        shell.screen === 'vendor' ? (
          <Stack.Screen name="VendorTabs" component={VendorTabNavigator} />
        ) : (
          <>
            <Stack.Screen name="HomeCliente" component={HomeClienteScreen} />
            <Stack.Screen name="UpgradeToSeller" component={UpgradeToSellerScreen} />
            <Stack.Screen name="Reappeal" component={ReappealScreen} />
          </>
        )
      ) : (
        <>
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="EmailVerification" component={EmailVerificationScreen} />
        </>
      )}
    </Stack.Navigator>
  );
};
