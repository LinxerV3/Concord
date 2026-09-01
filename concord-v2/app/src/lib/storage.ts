import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from "./firebase";

export const storage = getStorage(app);

/** Downscale + compress an image File in the browser before upload.
   Keeps avatars fast to load and cheap to store. */
function compressImage(file: File, maxSize = 256, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > maxSize) { height = (height / width) * maxSize; width = maxSize; }
      else if (height > maxSize) { width = (width / height) * maxSize; height = maxSize; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
        "image/jpeg", quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Not a valid image")); };
    img.src = url;
  });
}

/** Upload an avatar for a user; returns the public download URL. */
export async function uploadAvatar(uid: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please pick an image file.");
  const blob = await compressImage(file, 256, 0.85);
  const path = `avatars/${uid}/${Date.now()}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}

/** Upload a custom emoji image (small square). Returns download URL. */
export async function uploadEmoji(uid: string, name: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please pick an image file.");
  const blob = await compressImage(file, 64, 0.9);
  const path = `emojis/${uid}/${name}_${Date.now()}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}
