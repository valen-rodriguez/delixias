import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { VendorHomeScreen } from '@/screens/vendor/VendorHomeScreen';
import { VendorProfileScreen } from '@/screens/vendor/VendorProfileScreen';
import type { VendorTabParamList } from './types';

const Tab = createBottomTabNavigator<VendorTabParamList>();

export const VendorTabNavigator = () => {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="VendorHome" component={VendorHomeScreen} options={{ title: 'Inicio' }} />
      <Tab.Screen
        name="VendorProfile"
        component={VendorProfileScreen}
        options={{ title: 'Perfil' }}
      />
    </Tab.Navigator>
  );
};
