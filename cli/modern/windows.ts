import { dlopen, ptr } from 'bun:ffi';

export function guardConsoleInput() {
  if (process.platform !== 'win32' || !process.stdin.isTTY) return () => {};
  let library: ReturnType<typeof dlopen>;
  try {
    library = dlopen('kernel32.dll', {
      GetStdHandle: { args: ['i32'], returns: 'ptr' },
      GetConsoleMode: { args: ['ptr', 'ptr'], returns: 'i32' },
      SetConsoleMode: { args: ['ptr', 'u32'], returns: 'i32' },
    });
  } catch { return () => {}; }
  const handle = library.symbols.GetStdHandle(-10);
  const mode = new Uint32Array(1);
  if (!library.symbols.GetConsoleMode(handle, ptr(mode))) { library.close(); return () => {}; }
  const initial = mode[0];
  const enforce = () => {
    if (library.symbols.GetConsoleMode(handle, ptr(mode)) && mode[0] & 1) library.symbols.SetConsoleMode(handle, mode[0] & ~1);
  };
  // Console modes are shared with the parent process and can be reapplied later.
  enforce();
  const timer = setInterval(enforce, 150);
  timer.unref();
  return () => { clearInterval(timer); library.symbols.SetConsoleMode(handle, initial); library.close(); };
}
