const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function mergeValue(base, local, remote, location, preference) {
  if (equal(local, base)) return remote;
  if (equal(remote, base) || equal(local, remote)) return local;
  if (base && local && remote && [base, local, remote].every(value => typeof value === 'object' && !Array.isArray(value))) {
    return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])]
      .map(key => [key, mergeValue(base[key], local[key], remote[key], `${location}.${key}`, preference)])
      .filter(([, value]) => value !== undefined));
  }
  if (preference === 'local') return local;
  if (preference === 'remote') return remote;
  const error = new Error(`画布修改冲突：${location}`);
  error.statusCode = 409;
  throw error;
}

// Merge by identity, then by field: moving a node must not erase an Agent result.
export function mergeFilmCanvas(base, local, remote, preference) {
  const mergeItems = key => {
    const maps = [base, local, remote].map(graph => new Map((graph[key] || []).map(item => [item.id, item])));
    return [...new Set([...maps[2].keys(), ...maps[1].keys(), ...maps[0].keys()])]
      .map(id => mergeValue(maps[0].get(id), maps[1].get(id), maps[2].get(id), `${key}.${id}`, preference))
      .filter(Boolean);
  };
  const nodes = mergeItems('nodes'), ids = new Set(nodes.map(node => node.id));
  return { nodes, edges: mergeItems('edges').filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}
