import React, { createContext, useContext } from 'react';
import { useFonts } from 'expo-font';
import { fonts } from './theme';

const FontContext = createContext(false);
export function AppFonts({ children }: { children: React.ReactNode }) {
  const [loaded] = useFonts({
    [fonts.display]: require('../../assets/fonts/BigShoulders-800.ttf'),
    [fonts.displayHeavy]: require('../../assets/fonts/BigShoulders-900.ttf'),
    [fonts.body]: require('../../assets/fonts/InstrumentSans-Regular.ttf'),
    [fonts.bold]: require('../../assets/fonts/InstrumentSans-Bold.ttf'),
    [fonts.mono]: require('../../assets/fonts/JetBrainsMono-600.ttf'),
    [fonts.arabic]: require('../../assets/fonts/IBMPlexSansArabic-Regular.ttf'),
    [fonts.arabicBold]: require('../../assets/fonts/IBMPlexSansArabic-Bold.ttf'),
  });
  return <FontContext.Provider value={loaded}>{children}</FontContext.Provider>;
}
export const useAppFonts = () => useContext(FontContext);
