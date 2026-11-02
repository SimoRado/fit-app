import { describe, expect, it } from 'vitest';
import { localize, t } from '../src/core/i18n';

describe('centralized localization', () => {
  it('provides translated tabs and common form actions in all supported languages', () => {
    expect(t('fr', 'habits')).toBe('Habitudes');
    expect(t('ar', 'workouts')).toBe('التمارين');
    expect(localize('Save profile', 'fr')).toBe('Enregistrer le profil');
    expect(localize('Save profile', 'ar')).toBe('حفظ الملف الشخصي');
    expect(localize('No completed workout sessions in this period.', 'fr')).toContain('Aucune séance');
    expect(localize('Fitness goal: ', 'fr')).toBe('Objectif sportif :');
    expect(localize('Build discipline', 'ar')).toBe('تعزيز الانضباط');
  });
  it('formats dates and numbers for French and Arabic without changing English', () => {
    expect(localize('2026-11-02', 'en')).not.toBe('2026-11-02');
    expect(localize('2026-11-02', 'fr')).not.toBe('2026-11-02');
    expect(localize('2026-11-02', 'ar')).not.toBe('2026-11-02');
    expect(localize('82.5', 'fr')).toContain(',');
    expect(localize('82.5', 'ar')).not.toBe('82.5');
  });
  it('localizes dynamic reminder text while preserving the user’s habit name', () => {
    expect(localize('Time for Reading', 'fr')).toBe('C’est l’heure de Reading');
    expect(localize('Time for Reading', 'ar')).toBe('حان وقت Reading');
  });
  it('localizes dynamic dashboard progress and its zero-objective states', () => {
    expect(localize('Daily progress: 2/5 objectives · 40%', 'fr')).toContain('Progrès du jour');
    expect(localize('Daily progress: 2/5 objectives · 40%', 'ar')).toContain('تقدم اليوم');
    expect(localize("Today's habits · 50%", 'fr')).toBe('Habitudes du jour · 50%');
    expect(localize('No objectives scheduled today.', 'ar')).toBe('لا توجد أهداف مجدولة اليوم.');
    expect(localize('No fixed-schedule habits today.', 'fr')).toBe('Aucune habitude à fréquence fixe aujourd’hui.');
    expect(localize('Best fixed-habit streak: 3 scheduled occurrences', 'fr')).toContain('3 occurrences planifiées');
    expect(localize('Fixed-habit streaks: 3 current · 4 longest scheduled occurrences', 'fr')).toContain('3 occurrences planifiées');
    expect(localize('Weekly quota streaks: 2 current · 5 longest weeks', 'ar')).toContain('الحصة الأسبوعية');
    expect(localize('Current streak: 2 weeks', 'ar')).toContain('السلسلة الحالية: ٢ أسابيع');
  });
});
