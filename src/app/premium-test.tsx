import React from 'react';
import { Redirect } from 'expo-router';

/** Older entry point: the Cubyfit Pro paywall replaces the temporary test screen. */
export default function PremiumTest() { return <Redirect href="/paywall"/>; }
