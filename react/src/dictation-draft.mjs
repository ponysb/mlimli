// Only revise text owned by this recording; preserve the surrounding draft.
export function dictationDraftUpdate(base, previous, next) {
  const prefix = base + (base && !/\s$/.test(base) ? ' ' : '');
  return value => {
    if (!previous) return value === base ? prefix + next : value;
    const owned = prefix + previous;
    if (!value.startsWith(owned)) return value;
    return prefix + next + value.slice(owned.length);
  };
}
