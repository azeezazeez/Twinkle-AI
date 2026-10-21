/**
 * Files with the same name get numbered in upload order so they can be told
 * apart: "Resume.pdf" uploaded three times becomes "Resume (1).pdf",
 * "Resume (2).pdf" and "Resume (3).pdf". A name that appears once is untouched.
 */
export function numberDuplicateNames<T extends { id: number; name: string }>(docs: T[]): Map<number, string> {
  const groups = new Map<string, T[]>();
  for (const doc of docs) {
    const key = doc.name.toLowerCase();
    const list = groups.get(key);
    if (list) list.push(doc);
    else groups.set(key, [doc]);
  }

  const result = new Map<number, string>();
  for (const list of groups.values()) {
    if (list.length === 1) {
      result.set(list[0].id, list[0].name);
      continue;
    }
    // Ids grow with upload time, so the oldest copy is number 1.
    [...list].sort((a, b) => a.id - b.id).forEach((doc, index) => {
      const dot = doc.name.lastIndexOf('.');
      const hasExtension = dot > 0 && dot < doc.name.length - 1;
      const base = hasExtension ? doc.name.slice(0, dot) : doc.name;
      const extension = hasExtension ? doc.name.slice(dot) : '';
      result.set(doc.id, `${base} (${index + 1})${extension}`);
    });
  }
  return result;
}
