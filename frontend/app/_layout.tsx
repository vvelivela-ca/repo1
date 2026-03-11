import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1a1a2e',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          contentStyle: {
            backgroundColor: '#0f0f1a',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Holdings Hub',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="add-holding"
          options={{
            title: 'Add Holding',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="edit-holding"
          options={{
            title: 'Edit Holding',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="holding-details"
          options={{
            title: 'Holding Details',
          }}
        />
      </Stack>
    </>
  );
}
