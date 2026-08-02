import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import { supabase } from '@/lib/supabase';

/**
 * The encrypted original of an imported GEDCOM.
 *
 * The brief's privacy claim is "your GEDCOM file is encrypted on your device
 * before it ever reaches our servers — we store it, but we cannot read it".
 * That is only true if the key never leaves the device, so it doesn't: it is
 * generated here, kept in the iOS Keychain, and shown to the user as a
 * recovery code they can save. Nothing about the key is ever sent anywhere.
 *
 * The consequence is deliberate and worth stating plainly: a stored file with
 * no key on any device, and no saved recovery code, is unreadable ciphertext
 * forever. There is no reset. That is the cost of the claim being literally
 * true rather than approximately true.
 */

const KEY_ITEM = 'gedcomKey';
const KEYCHAIN_SERVICE = 'com.witnesslives.witness.vault';
const BUCKET = 'gedcom-files';

// AES-256. A recovery code that decodes to any other length is not one of ours,
// however well-formed its base64 happens to be.
const KEY_BYTES = 32;

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: KEYCHAIN_SERVICE,
  // Every path through this module is user-initiated and in the foreground, so
  // the strictest accessibility that still works is the right one.
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

/**
 * SecureStore has no web implementation — there is no browser equivalent of
 * the Keychain that would honour the claim above. On web the vault is simply
 * absent rather than quietly downgraded to something weaker.
 */
export async function isVaultAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/** The saved key as a base64 recovery code, or null if this device has none. */
export async function getRecoveryCode(): Promise<string | null> {
  if (!(await isVaultAvailable())) return null;
  return SecureStore.getItemAsync(KEY_ITEM, STORE_OPTIONS);
}

async function loadKey(): Promise<AESEncryptionKey | null> {
  const code = await getRecoveryCode();
  if (!code) return null;
  return AESEncryptionKey.import(code, 'base64');
}

/**
 * The device's key, generating and saving one the first time. Returns whether
 * it was just created, so the caller can show the recovery code at the one
 * moment the user is thinking about this file.
 */
export async function getOrCreateKey(): Promise<{ key: AESEncryptionKey; created: boolean }> {
  const existing = await loadKey();
  if (existing) return { key: existing, created: false };

  const key = await AESEncryptionKey.generate();
  await SecureStore.setItemAsync(KEY_ITEM, await key.encoded('base64'), STORE_OPTIONS);
  return { key, created: true };
}

/**
 * Adopt a recovery code from another device. Rejects anything that isn't a
 * 32-byte base64 key before saving, so a mistyped code fails here — with an
 * error the user can act on — rather than at some later decrypt as "the file
 * is corrupt".
 */
export async function restoreKeyFromRecoveryCode(code: string): Promise<void> {
  const trimmed = code.trim().replace(/\s/g, '');
  if (!trimmed) throw new Error('Enter your recovery code.');

  let key: AESEncryptionKey;
  try {
    key = await AESEncryptionKey.import(trimmed, 'base64');
  } catch {
    throw new Error("That doesn't look like a recovery code. Check it and try again.");
  }
  if ((await key.bytes()).length !== KEY_BYTES) {
    throw new Error("That doesn't look like a recovery code. Check it and try again.");
  }

  await SecureStore.setItemAsync(KEY_ITEM, trimmed, STORE_OPTIONS);
}

function objectPath(userId: string, treeId: string): string {
  // The bucket policy checks the first path segment against auth.uid(), so the
  // user id prefix is load-bearing, not decorative.
  return `${userId}/${treeId}.enc`;
}

export interface StoredOriginal {
  path: string;
  bytes: number;
}

/**
 * Encrypt the file exactly as the user picked it — .ged or zipped .gdz, before
 * any parsing — and put the ciphertext in Storage. Storing the original bytes
 * rather than extracted text means a restore reproduces the file, not our
 * reading of it.
 */
export async function storeOriginal(
  userId: string,
  treeId: string,
  original: Uint8Array,
): Promise<StoredOriginal> {
  const { key } = await getOrCreateKey();
  const sealed = await aesEncryptAsync(original, key);
  const combined = (await sealed.combined('bytes')) as Uint8Array;

  const path = objectPath(userId, treeId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, toArrayBuffer(combined), {
    contentType: 'application/octet-stream',
    upsert: true,
  });
  if (error) throw new Error(error.message);

  return { path, bytes: combined.length };
}

/**
 * Pull a stored original back and decrypt it. The bucket is private, so this
 * goes through a short-lived signed URL: the file is downloaded to the cache
 * directory rather than buffered through fetch, because React Native's fetch
 * has no dependable path from a response body to raw bytes.
 */
export async function fetchOriginal(path: string): Promise<Uint8Array> {
  const key = await loadKey();
  if (!key) {
    throw new Error(
      'This device does not have the key for that file. Enter your recovery code first.',
    );
  }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error('Could not reach the stored file.');

  const scratch = new Directory(Paths.cache, 'vault');
  if (!scratch.exists) scratch.create();

  let downloaded: File | null = null;
  try {
    downloaded = await File.downloadFileAsync(data.signedUrl, scratch);
    const combined = await downloaded.bytes();
    const plaintext = await aesDecryptAsync(AESSealedData.fromCombined(combined), key, {
      output: 'bytes',
    });
    return plaintext as Uint8Array;
  } catch (error) {
    // A wrong key fails here, in the GCM tag check, and the raw message says
    // nothing a reader could use. Name the likely cause instead.
    throw new Error(
      `Could not open the stored file. ${
        error instanceof Error ? error.message : String(error)
      } If you restored a recovery code, check it belongs to this account.`,
    );
  } finally {
    // Plaintext never touches disk, but the ciphertext copy has served its
    // purpose either way.
    try {
      downloaded?.delete();
    } catch {
      /* a leftover in the cache directory is not worth failing a restore over */
    }
  }
}

/**
 * Decrypt a stored original onto disk and hand back its uri, so a restore can
 * go through the ordinary import screen — same parse, same progress, same
 * error handling — instead of a second, subtly different copy of that flow.
 */
export async function restoreToCacheFile(path: string, fileName: string): Promise<string> {
  const plaintext = await fetchOriginal(path);
  const scratch = new Directory(Paths.cache, 'restored');
  if (!scratch.exists) scratch.create();

  const file = new File(scratch, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(plaintext);
  return file.uri;
}

/** Storage keeps the object; deleting a tree should not leave it orphaned. */
export async function discardOriginal(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Supabase's upload takes an ArrayBuffer on React Native. Slice rather than
  // hand over .buffer: a view with an offset would otherwise upload the whole
  // backing store.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
