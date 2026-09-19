import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'providers/aligo': 'src/providers/aligo.ts',
    'providers/solapi': 'src/providers/solapi.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [/^solapi/],
});
