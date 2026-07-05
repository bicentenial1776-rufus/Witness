import { ScrollView, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FAQ } from '@/constants/faq';
import { WideContent } from '@/constants/theme';

export default function FaqScreen() {
  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 12 }}>
        <ThemedText type="small">
          GEDCOM data can be messy — most surprises have a simple explanation.
        </ThemedText>
        {FAQ.map((entry) => (
          <Card key={entry.question}>
            <ThemedText type="subtitle">{entry.question}</ThemedText>
            <View style={{ marginTop: 4 }}>
              <ThemedText>{entry.answer}</ThemedText>
            </View>
          </Card>
        ))}
      </ScrollView>
    </ThemedView>
  );
}
