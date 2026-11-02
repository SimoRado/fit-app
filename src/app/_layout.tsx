import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '../state/app';
import { colors } from '../ui/theme';
export default function Root() { return <AppProvider><StatusBar style="light"/><Stack screenOptions={{headerStyle:{backgroundColor:colors.bg},headerTintColor:colors.text,contentStyle:{backgroundColor:colors.bg}}}><Stack.Screen name="index" options={{headerShown:false}}/><Stack.Screen name="onboarding" options={{headerShown:false}}/><Stack.Screen name="(tabs)" options={{headerShown:false}}/></Stack></AppProvider>; }
