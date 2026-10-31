export const desktopDefaults = { wallpaper: 'blue', customWallpaper: '', dockSize: 48, dockMagnification: true, reduceMotion: false, reduceTransparency: false, openOn: 'double', showHidden: false, windowLayout: 'cascade' };
export const preferenceKey = id => `mli.ssh.desktop.preferences.v1:${id}`;
export function readDesktopPreferences(id) {
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey(id)) || '{}');
    return { ...desktopDefaults, ...saved, dockSize: [40,48,56].includes(saved.dockSize) ? saved.dockSize : 48, wallpaper: ['blue','sunset','graphite','custom'].includes(saved.wallpaper) ? saved.wallpaper : 'blue' };
  } catch { return { ...desktopDefaults }; }
}
