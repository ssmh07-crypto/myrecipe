import 'react-native-url-polyfill/auto'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

import type { Database } from '../types/database.generated'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey)

const secureChunkSize = 1_800
const chunkCountKey = (key: string) => `${key}__chunk_count`
const chunkKey = (key: string, index: number) => `${key}__chunk_${index}`

const secureSessionStorage = {
  getItem: async (key: string) => {
    const rawCount = await SecureStore.getItemAsync(chunkCountKey(key))
    const count = Number(rawCount || 0)
    if (count > 0 && count <= 20) {
      const chunks = await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))))
      if (chunks.every((chunk): chunk is string => chunk !== null)) return chunks.join('')
    }

    const legacyValue = await AsyncStorage.getItem(key)
    if (legacyValue) {
      await secureSessionStorage.setItem(key, legacyValue)
      await AsyncStorage.removeItem(key)
    }
    return legacyValue
  },
  setItem: async (key: string, value: string) => {
    const previousCount = Number(await SecureStore.getItemAsync(chunkCountKey(key)) || 0)
    const chunks = Array.from({ length: Math.ceil(value.length / secureChunkSize) }, (_, index) =>
      value.slice(index * secureChunkSize, (index + 1) * secureChunkSize),
    )
    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)))
    await SecureStore.setItemAsync(chunkCountKey(key), String(chunks.length))
    if (previousCount > chunks.length) {
      await Promise.all(Array.from({ length: previousCount - chunks.length }, (_, index) =>
        SecureStore.deleteItemAsync(chunkKey(key, chunks.length + index)),
      ))
    }
  },
  removeItem: async (key: string) => {
    const count = Number(await SecureStore.getItemAsync(chunkCountKey(key)) || 0)
    await Promise.all([
      ...Array.from({ length: Math.min(count, 20) }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index))),
      SecureStore.deleteItemAsync(chunkCountKey(key)),
      AsyncStorage.removeItem(key),
    ])
  },
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://example.supabase.co',
  supabaseAnonKey || 'missing-anon-key',
  {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
)
