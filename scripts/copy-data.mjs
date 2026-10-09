import { cpSync, existsSync } from 'node:fs';

if (existsSync('data')) cpSync('data', 'dist/data', { recursive: true });
