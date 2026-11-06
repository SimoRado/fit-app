import React, { createContext, useContext } from 'react';
import { useFonts } from 'expo-font';
import { fonts } from './theme';

const FontContext = createContext(false);
export function AppFonts({ children }: { children: React.ReactNode }) {
  const [loaded] = useFonts({
    [fonts.display]: require('../../assets/fonts/BricolageGrotesque-700.ttf'),
    [fonts.displayHeavy]: require('../../assets/fonts/BricolageGrotesque-800.ttf'),
    [fonts.body]: require('../../assets/fonts/Figtree-400.ttf'),
    [fonts.medium]: require('../../assets/fonts/Figtree-500.ttf'),
    [fonts.semibold]: require('../../assets/fonts/Figtree-600.ttf'),
    [fonts.bold]: require('../../assets/fonts/Figtree-700.ttf'),
    [fonts.arabic]: require('../../assets/fonts/IBMPlexSansArabic-Regular.ttf'),
    [fonts.arabicBold]: require('../../assets/fonts/IBMPlexSansArabic-Bold.ttf'),
  });
  return <FontContext.Provider value={loaded}>{children}</FontContext.Provider>;
}
export const useAppFonts = () => useContext(FontContext);
