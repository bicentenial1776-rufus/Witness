import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { mono } from '@/constants/theme';
import { useLetterpress } from '@/hooks/use-theme';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
import { captureStone } from '@/lib/grave-captures';

/**
 * At the Stone — the capture step (design artifact 2026-08-25). One
 * stone at a time: shoot as many angles as the light demands (raking
 * angles read best), then NEXT STONE seals the capture. Uploads and the
 * reading happen behind the scenes; with no signal the stone queues on
 * disk and reads when the network returns.
 */
export default function AtTheStoneScreen() {
  const L = useLetterpress();
  const { activeTree, loadFailed } = useActiveTree();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [angles, setAngles] = useState<string[]>([]);
  const [stonesDone, setStonesDone] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [busy, setBusy] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <ThemedView style={{ flex: 1, padding: 24, gap: 8 }}>
        <Stack.Screen options={{ title: 'At the Stone' }} />
        <ThemedText type="subtitle">Capture lives on the phone</ThemedText>
        <ThemedText>
          Photograph headstones with the Witness app on your iPhone or iPad — the readings and
          verdicts appear here too, under Stone readings.
        </ThemedText>
        <ThemedText type="link" onPress={() => router.push('/stones')}>
          Stone readings ›
        </ThemedText>
      </ThemedView>
    );
  }

  if (!activeTree) {
    return (
      <ThemedView style={{ flex: 1, padding: 24 }}>
        <Stack.Screen options={{ title: 'At the Stone' }} />
        <ThemedText>{noTreeMessage(loadFailed, 'to check stones against your people')}</ThemedText>
      </ThemedView>
    );
  }

  if (!permission?.granted) {
    return (
      <ThemedView style={{ flex: 1, padding: 24, gap: 10, justifyContent: 'center' }}>
        <Stack.Screen options={{ title: 'At the Stone' }} />
        <ThemedText type="subtitle">Point Witness at a headstone</ThemedText>
        <ThemedText>
          Witness photographs the stone, reads the inscription, and checks the person against
          your tree. The camera is used for nothing else.
        </ThemedText>
        <Button title="Allow the camera" onPress={() => requestPermission()} />
      </ThemedView>
    );
  }

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.6 });
      if (photo?.uri) setAngles((a) => [...a, photo.uri]);
    } finally {
      setBusy(false);
    }
  };

  const sealStone = async () => {
    if (!angles.length || busy) return;
    setBusy(true);
    const photoUris = angles;
    setAngles([]);
    try {
      // Location at the moment of sealing — GPS and compass name the
      // cemetery and place the stone within it.
      let coords: { latitude: number | null; longitude: number | null; accuracy: number | null } = {
        latitude: null,
        longitude: null,
        accuracy: null,
      };
      let heading: number | null = null;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        const granted = perm.granted || (await Location.requestForegroundPermissionsAsync()).granted;
        if (granted) {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Highest,
          });
          coords = pos.coords;
          heading = (await Location.getHeadingAsync()).trueHeading ?? null;
        }
      } catch {
        // A stone with no coordinates still reads; it just goes unplaced.
      }
      const result = await captureStone({
        treeId: activeTree.id,
        photoUris,
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading,
        accuracyM: coords.accuracy,
        capturedAt: new Date().toISOString(),
      });
      setStonesDone((n) => n + 1);
      if (result === 'queued') setQueuedCount((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: L.paper }}>
      <Stack.Screen options={{ title: 'At the Stone' }} />
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
      <View style={{ padding: 16, gap: 10, backgroundColor: L.paper }}>
        <Text style={mono(12, L.muted)} maxFontSizeMultiplier={1.3}>
          {angles.length
            ? `${angles.length} ANGLE${angles.length === 1 ? '' : 'S'} OF THIS STONE — RAKING LIGHT READS BEST`
            : stonesDone
              ? `${stonesDone} STONE${stonesDone === 1 ? '' : 'S'} THIS VISIT${queuedCount ? ` · ${queuedCount} QUEUED FOR SIGNAL` : ' · READING…'}`
              : 'SHOOT THE STONE — ANGLES WELCOME'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={shoot}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={angles.length ? 'Another angle' : 'Photograph the stone'}
            style={{
              flex: 1,
              paddingVertical: 14,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: L.rule,
              backgroundColor: L.well,
            }}
          >
            <Text style={mono(12.5, L.ink)}>{angles.length ? 'ANOTHER ANGLE' : 'SHOOT'}</Text>
          </Pressable>
          <Pressable
            onPress={sealStone}
            disabled={!angles.length || busy}
            accessibilityRole="button"
            accessibilityLabel="Finish this stone"
            style={{
              flex: 1,
              paddingVertical: 14,
              alignItems: 'center',
              backgroundColor: angles.length ? L.amber : L.rule,
            }}
          >
            <Text style={mono(12.5, L.paper)}>NEXT STONE ›</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/stones')} hitSlop={8} accessibilityRole="button">
          <Text style={mono(12, L.amber)}>STONE READINGS ›</Text>
        </Pressable>
      </View>
    </View>
  );
}
