import React from 'react';
import { View } from 'react-native';
import { passwordRequirements } from '../core/passwordPolicy';
import { Text } from './LocalizedText';
import { colors } from './theme';

export function PasswordRequirements({ password }: { password: string }) {
  return <View style={{ gap: 3 }} accessibilityLabel="Password requirements">
    {passwordRequirements.map(requirement => {
      const met = requirement.test(password);
      return <Text key={requirement.label} style={{ color: password && met ? colors.accent : colors.muted, fontSize: 12 }}>
        {password ? met ? '✓ ' : '○ ' : '• '}{requirement.label}
      </Text>;
    })}
  </View>;
}
