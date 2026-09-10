/**
 * رفع ملف على مقاطع — جهة المتصفّح
 * ===============================================================
 * Vercel ترفض أي طلب جسمه أكبر من ٤.٥ م.ب، وبعض ملفات Word أكبر
 * (أكبر كتاب في المكتبة ٤.٧٩ م.ب). فنقسّم الملف هنا ونرسل كل مقطع
 * في طلب مستقلّ، ونحتفظ بالمراجع لنرسلها كلها عند الحفظ.
 *
 * لماذا يحتفظ المتصفّح بالمراجع لا الخادم؟ لأن كل طلب على Vercel قد
 * يصل نسخة مختلفة من الدالة — لا ذاكرة مشتركة بينها. الطرف الوحيد
 * الذي يرى الرفع كاملاً هو المتصفّح.
 */

/** ٣.٥ م.ب — دون حدّ Vercel بفسحة تكفي ترويسات multipart */
const CHUNK_BYTES = 3.5 * 1024 * 1024;

export interface UploadProgress {
  sent: number;
  total: number;
}

export async function uploadInChunks(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<string[]> {
  const refs: string[] = [];
  const total = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));

  for (let index = 0; index < total; index++) {
    const slice = file.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);

    const body = new FormData();
    body.set('chunk', slice);

    const response = await fetch('/api/admin/upload', { method: 'POST', body });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `تعذّر رفع الجزء ${index + 1} من ${total}.`);
    }

    const { ref } = (await response.json()) as { ref: string };
    refs.push(ref);
    onProgress?.({ sent: index + 1, total });
  }

  return refs;
}
