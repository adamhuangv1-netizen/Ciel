/// <reference types="vite/client" />
import type { CielApi } from '../../shared/types'

declare global {
  interface Window {
    ciel: CielApi
  }
}
