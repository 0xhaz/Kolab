// Polyfills must load before anything that touches crypto, TextEncoder or Buffer (Privy, Solana).
import 'fast-text-encoding';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
g.Buffer = g.Buffer ?? Buffer;

import 'expo-router/entry';
