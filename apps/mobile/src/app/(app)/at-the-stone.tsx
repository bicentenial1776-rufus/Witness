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
import { showAlert } from '@/lib/alert';
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
  const [cameraReady, setCameraReady] = useState(false);
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
    if (busy || !cameraReady) return;
    setBusy(true);
    try {
      // iOS can hang takePictureAsync when the session gets interrupted
      // (a phone call, backgrounding mid-shot); the race keeps a hung
      // shutter from wedging `busy` and silently eating every later tap.
      const photo = await Promise.race([
        camera.current?.takePictureAsync({ quality: 0.6 }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('The shutter timed out.')), 8000),
        ),
      ]);
      if (photo?.uri) {
        setAngles((a) => [...a, photo.uri]);
      } else {
        showAlert('No photo came back', 'Try the shot again.');
      }
    } catch (e) {
      showAlert(
        'The shot failed',
        e instanceof Error ? e.message : 'Try again — leaving and reopening this screen resets the camera.',
      );
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
    } catch (e) {
      // captureStone queues on network failure; reaching here means the
      // photos couldn't even be persisted. Give the angles back rather
      // than dropping the stone on the ground.
      setAngles(photoUris);
      showAlert('The stone could not be saved', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: L.paper }}>
      <Stack.Screen options={{ title: 'At the Stone' }} />
      <CameraView
        ref={camera}
        style={{ flex: 1 }}
        facing="back"
        onCameraReady={() => setCameraReady(true)}
      />
      <View style={{ padding: 16, gap: 10, backgroundColor: L.paper }}>
        <Text style={mono(12, L.muted)} maxFontSizeMultiplier={1.3}>
          {!cameraReady
            ? 'THE CAMERA IS WAKING…'
            : angles.length
              ? `${angles.length} ANGLE${angles.length === 1 ? '' : 'S'} OF THIS STONE — RAKING LIGHT READS BEST`
              : stonesDone
                ? `${stonesDone} STONE${stonesDone === 1 ? '' : 'S'} THIS VISIT${queuedCount ? ` · ${queuedCount} QUEUED FOR SIGNAL` : ' · READING…'}`
                : 'SHOOT THE STONE — ANGLES WELCOME'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={shoot}
            disabled={busy || !cameraReady}
            accessibilityRole="button"
            accessibilityLabel={angles.length ? 'Another angle' : 'Photograph the stone'}
            style={{
              flex: 1,
              paddingVertical: 14,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: L.rule,
              backgroundColor: L.well,
              opacity: busy || !cameraReady ? 0.4 : 1,
            }}
          >
            <Text style={mono(12.5, L.ink)}>
              {busy ? 'HOLD…' : angles.length ? 'ANOTHER ANGLE' : 'SHOOT'}
            </Text>
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
              opacity: busy ? 0.4 : 1,
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
