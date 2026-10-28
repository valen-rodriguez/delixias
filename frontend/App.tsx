import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ProfileProvider } from './src/context/ProfileContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <ProfileProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </ProfileProvider>
  );
}
