export function filterRemoteModels(models, query) {
  const keyword = query.trim().toLowerCase();
  return keyword ? models.filter(model => model.toLowerCase().includes(keyword)) : models;
}

export function selectVisibleModels(selected, visible, checked) {
  const visibleSet = new Set(visible);
  return checked ? [...new Set([...selected, ...visible])] : selected.filter(model => !visibleSet.has(model));
}
