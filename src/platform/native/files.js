import { Directory, Encoding } from '@capacitor/filesystem';

/**
 * Sub-folder of the phone's public Documents folder that exports land in.
 * Kept as "Step Tracker" through the Walkaholic rebrand: earlier backups and
 * exports live there, and a second folder would split them.
 */
export const NATIVE_EXPORT_FOLDER = 'Step Tracker';

const UNSAFE_FILE_NAME_CHARS = /[\\/:*?"<>|]/g;
const GRANTED = 'granted';

/**
 * Save text into Documents/Step Tracker/, where the Files app (and a PC over
 * USB) can see it and it survives uninstalling the app. Android 10 and older
 * need the storage permission for that; newer versions let an app write its
 * own files there without asking.
 *
 * @param {object} filesystem  The Capacitor Filesystem plugin.
 * @param {string} fileName
 * @param {string} text
 * @returns {Promise<{ location: string }>}  Where the user can find the file.
 */
export async function saveTextFileToDocuments(filesystem, fileName, text) {
  const { publicStorage } = await filesystem.checkPermissions();
  if (publicStorage !== GRANTED) {
    const requested = await filesystem.requestPermissions();
    if (requested.publicStorage !== GRANTED) {
      throw new Error('Storage permission is needed to save files to Documents.');
    }
  }

  const path = `${NATIVE_EXPORT_FOLDER}/${fileName.replace(UNSAFE_FILE_NAME_CHARS, '_')}`;
  await filesystem.writeFile({
    path,
    data: text,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  return { location: `Documents/${path}` };
}
