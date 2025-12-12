export const hashContent = (content: string) => {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash << 5) - hash + content.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
};

export const contentKey = (plaintext: string) => {
  const text = (plaintext || "").trim();
  return `${text.length}:${hashContent(text)}`;
};

export const mergeLocalAndCloud = (localNotes: any[], cloudNotes: any[]) => {
  // First merge by id: cloud seeds, local overrides same id (keep edited text/imageData)
  const byId = new Map<string, any>();
  for (const note of cloudNotes) {
    byId.set(String(note.id), note);
  }
  for (const note of localNotes) {
    const key = String(note.id);
    if (byId.has(key)) {
      const existing = byId.get(key);
      byId.set(key, {
        ...existing,
        ...note,
        imageData: note.imageData ?? existing.imageData ?? null,
        images: Array.isArray(note.images) ? note.images : existing.images ?? [],
      });
    } else {
      byId.set(key, {
        ...note,
        images: Array.isArray(note.images) ? note.images : [],
      });
    }
  }

  // Then dedupe by content to avoid duplicates with different ids but identical plaintext.
  const byContent = new Map<string, any>();
  for (const note of byId.values()) {
    const key = contentKey(note.plaintext);
    if (byContent.has(key)) {
      const existing = byContent.get(key);
      byContent.set(key, {
        ...existing,
        ...note,
        id: existing.id, // keep authoritative id (cloud) to avoid UUID/type clashes
        imageData: note.imageData ?? existing.imageData ?? null,
        images: Array.isArray(note.images) ? note.images : existing.images ?? [],
      });
    } else {
      byContent.set(key, {
        ...note,
        images: Array.isArray(note.images) ? note.images : [],
      });
    }
  }

  return Array.from(byContent.values());
};

export const formatNotesToMarkdown = (
  notes: Array<{ id: any; plaintext: string; created_at?: string; imageData?: string | null; images?: { data: string; alt?: string }[] }>,
  metadata: Record<string, { tags?: string[] }> = {}
) => {
  return notes
    .map((note, idx) => {
      const timestamp = note.created_at ? new Date(note.created_at).toLocaleString() : "";
      const tags = metadata[String(note.id)]?.tags || [];
      const tagsLine = tags.length ? `\n**Tags:** ${tags.join(", ")}` : "";
      const images = Array.isArray(note.images) && note.images.length ? note.images : note.imageData ? [{ data: note.imageData }] : [];
      const imageSection = images
        .map((img, imgIdx) => `\n\n![Image ${imgIdx + 1} for note ${idx + 1}](${img.data})${img.alt ? `\nAlt: ${img.alt}` : ""}`)
        .join("");
      return `## Note ${idx + 1}\n${timestamp ? `**Created:** ${timestamp}` : ""}${tagsLine}\n\n${note.plaintext || ""}${imageSection}\n`;
    })
    .join("\n---\n\n");
};

export const reorderListByIds = (list: any[], fromId: string | number, toId: string | number) => {
  const fromIdx = list.findIndex((n) => String(n.id) === String(fromId));
  const toIdx = list.findIndex((n) => String(n.id) === String(toId));
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return list;
  const next = [...list];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
};

export const moveRelativeInList = (list: any[], id: string | number, direction: "up" | "down") => {
  const idx = list.findIndex((n) => String(n.id) === String(id));
  if (idx === -1) return list;
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(idx, 1);
  next.splice(targetIdx, 0, moved);
  return next;
};

export const sortWithPins = (notes: any[], metadata: Record<string, { pinned?: boolean }>) => {
  const pinned: any[] = [];
  const regular: any[] = [];
  for (const n of notes) {
    const isPinned = metadata[String(n.id)]?.pinned;
    if (isPinned) pinned.push(n);
    else regular.push(n);
  }
  return [...pinned, ...regular];
};

export const canExportNotes = (user: any, isPro: boolean, exporting: boolean) => {
  return !!user && isPro && !exporting;
};
